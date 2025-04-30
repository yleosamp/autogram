const { IgApiClient } = require('instagram-private-api');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

class InstagramBot {
    constructor() {
        this.ig = new IgApiClient();
        this.messagesSent = new Map();
        this.isRunning = false;
        this.monitorInterval = null;
        this.CACHE_FILE = path.join(__dirname, 'message-cache.json');
        this.config = {
            triggerWord: process.env.TRIGGER_WORD || 'quero',
            responseMessage: process.env.RESPONSE_MESSAGE || 'Obrigado pelo interesse!'
        };
    }

    async loadCache() {
        try {
            const exists = await fs.access(this.CACHE_FILE).then(() => true).catch(() => false);
            if (exists) {
                const data = await fs.readFile(this.CACHE_FILE, 'utf8');
                const jsonData = JSON.parse(data);
                this.messagesSent = new Map(
                    Object.entries(jsonData).map(([postId, users]) => [
                        postId,
                        new Set(users)
                    ])
                );
                console.log('Cache carregado com sucesso!');
            }
        } catch (error) {
            console.error('Erro ao carregar cache:', error);
            this.messagesSent = new Map();
        }
    }

    async saveCache() {
        try {
            const jsonData = Object.fromEntries(
                Array.from(this.messagesSent.entries()).map(([postId, users]) => [
                    postId,
                    Array.from(users)
                ])
            );
            await fs.writeFile(this.CACHE_FILE, JSON.stringify(jsonData, null, 2));
        } catch (error) {
            console.error('Erro ao salvar cache:', error);
        }
    }

    async login(username, password) {
        this.ig.state.generateDevice(username);
        await this.ig.account.login(username, password);
    }

    async getUserPosts(limit = 10) {
        try {
            const user = await this.ig.account.currentUser();
            const feed = this.ig.feed.user(user.pk);
            const posts = await feed.items();
            return posts.slice(0, limit).map(post => ({
                id: post.id,
                caption: post.caption?.text || '',
                mediaType: post.media_type,
                url: post.image_versions2?.candidates[0]?.url
            }));
        } catch (error) {
            console.error('Erro ao buscar posts:', error);
            throw error;
        }
    }

    async monitorComments(postId) {
        try {
            if (!this.messagesSent.has(postId)) {
                this.messagesSent.set(postId, new Set());
            }

            const comments = await this.ig.feed.mediaComments(postId).items();
            
            for (const comment of comments) {
                if (comment.text.toLowerCase() === this.config.triggerWord.toLowerCase() && 
                    !this.messagesSent.get(postId).has(comment.user_id)) {
                    try {
                        const thread = await this.ig.entity.directThread([comment.user_id.toString()]);
                        await thread.broadcastText(this.config.responseMessage);
                        
                        this.messagesSent.get(postId).add(comment.user_id);
                        await this.saveCache();
                        
                        console.log(`Mensagem enviada para ${comment.user.username} no post ${postId}`);
                    } catch (error) {
                        console.error(`Erro ao enviar mensagem para ${comment.user.username}:`, error);
                    }
                }
            }
        } catch (error) {
            console.error(`Erro ao monitorar comentários do post ${postId}:`, error);
        }
    }

    async startMonitoring() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        const posts = await this.getUserPosts();
        console.log(`Monitorando ${posts.length} posts`);
        
        this.monitorInterval = setInterval(async () => {
            for (const post of posts) {
                await this.monitorComments(post.id);
            }
        }, 30000);
    }

    stopMonitoring() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }
        this.isRunning = false;
    }

    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            config: this.config,
            cachedPosts: Array.from(this.messagesSent.keys()),
            totalResponsesSent: Array.from(this.messagesSent.values())
                .reduce((acc, set) => acc + set.size, 0)
        };
    }
}

module.exports = InstagramBot; 