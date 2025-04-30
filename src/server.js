const express = require('express');
const cors = require('cors');
const InstagramBot = require('./bot');

const app = express();
app.use(cors());
app.use(express.json());

const bot = new InstagramBot();

// Rota para iniciar o bot
app.post('/api/bot/start', async (req, res) => {
    try {
        const { username, password, triggerWord, responseMessage } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'Username e password são obrigatórios' 
            });
        }

        await bot.login(username, password);
        
        if (triggerWord || responseMessage) {
            bot.updateConfig({ triggerWord, responseMessage });
        }

        await bot.loadCache();
        await bot.startMonitoring();
        
        res.json({ 
            success: true, 
            message: 'Bot iniciado com sucesso',
            status: bot.getStatus()
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Rota para parar o bot
app.post('/api/bot/stop', (req, res) => {
    bot.stopMonitoring();
    res.json({ 
        success: true, 
        message: 'Bot parado com sucesso',
        status: bot.getStatus()
    });
});

// Rota para obter status do bot
app.get('/api/bot/status', (req, res) => {
    res.json(bot.getStatus());
});

// Rota para listar posts
app.get('/api/posts', async (req, res) => {
    try {
        const posts = await bot.getUserPosts();
        res.json({ 
            success: true, 
            posts 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Rota para atualizar configurações
app.post('/api/bot/config', (req, res) => {
    const { triggerWord, responseMessage } = req.body;
    bot.updateConfig({ triggerWord, responseMessage });
    res.json({ 
        success: true, 
        message: 'Configurações atualizadas com sucesso',
        config: bot.config
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
}); 