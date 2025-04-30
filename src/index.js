const { IgApiClient } = require('instagram-private-api');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const ig = new IgApiClient();

// Caminho para o arquivo de cache
const CACHE_FILE = path.join(__dirname, 'message-cache.json');

// Cache para armazenar os usuários que já receberam mensagens
let messagesSent = new Map();

// Função para carregar o cache do arquivo
async function loadCache() {
    try {
        const exists = await fs.access(CACHE_FILE).then(() => true).catch(() => false);
        if (exists) {
            const data = await fs.readFile(CACHE_FILE, 'utf8');
            const jsonData = JSON.parse(data);
            // Converte o objeto JSON de volta para Map com Sets
            messagesSent = new Map(
                Object.entries(jsonData).map(([postId, users]) => [
                    postId,
                    new Set(users)
                ])
            );
            console.log('Cache carregado com sucesso!');
        }
    } catch (error) {
        console.error('Erro ao carregar cache:', error);
        messagesSent = new Map();
    }
}

// Função para salvar o cache no arquivo
async function saveCache() {
    try {
        // Converte Map com Sets para objeto JSON
        const jsonData = Object.fromEntries(
            Array.from(messagesSent.entries()).map(([postId, users]) => [
                postId,
                Array.from(users)
            ])
        );
        await fs.writeFile(CACHE_FILE, JSON.stringify(jsonData, null, 2));
    } catch (error) {
        console.error('Erro ao salvar cache:', error);
    }
}

async function login() {
    ig.state.generateDevice(process.env.IG_USERNAME);
    await ig.account.login(process.env.IG_USERNAME, process.env.IG_PASSWORD);
}

async function getUserPosts(limit = 10) {
    try {
        const user = await ig.account.currentUser();
        const feed = ig.feed.user(user.pk);
        const posts = await feed.items();
        return posts.slice(0, limit).map(post => post.id);
    } catch (error) {
        console.error('Erro ao buscar posts:', error);
        throw error;
    }
}

async function monitorComments(postId) {
    try {
        if (!messagesSent.has(postId)) {
            messagesSent.set(postId, new Set());
        }

        const comments = await ig.feed.mediaComments(postId).items();
        
        for (const comment of comments) {
            if (comment.text.toLowerCase() === process.env.TRIGGER_WORD.toLowerCase() && 
                !messagesSent.get(postId).has(comment.user_id)) {
                try {
                    const thread = await ig.entity.directThread([comment.user_id.toString()]);
                    await thread.broadcastText(process.env.RESPONSE_MESSAGE);
                    
                    messagesSent.get(postId).add(comment.user_id);
                    // Salva o cache após cada nova mensagem enviada
                    await saveCache();
                    
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

async function monitorAllPosts() {
    try {
        const postIds = await getUserPosts();
        console.log(`Monitorando ${postIds.length} posts`);

        setInterval(async () => {
            for (const postId of postIds) {
                await monitorComments(postId);
            }
        }, 30000); // Verifica a cada 30 segundos
    } catch (error) {
        console.error('Erro ao monitorar posts:', error);
    }
}

async function init() {
    try {
        // Carrega o cache antes de iniciar
        await loadCache();
        
        await login();
        console.log('Login realizado com sucesso!');
        await monitorAllPosts();
    } catch (error) {
        console.error('Erro ao inicializar o bot:', error);
    }
}

init(); 