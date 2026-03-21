import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import TelegramBot from 'node-telegram-bot-api';
import { db } from './database/db.js';
import { gameRouter } from './routes/game.js';
import { userRouter } from './routes/user.js';
import { upgradeRouter } from './routes/upgrades.js';
import { referralRouter } from './routes/referrals.js';
import { tasksRouter } from './routes/tasks.js';
import { withdrawalRouter } from './routes/withdrawal.js';
import { exchangeRouter } from './routes/exchange.js';
import { adminRouter } from './routes/admin.js';
import { antibotMiddleware } from './middleware/antibot.js';
import { authMiddleware } from './middleware/auth.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Telegram Bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Bot commands
bot.onText(/\/start(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const referralCode = match[1]?.trim();
    
    try {
        // Check if user exists
        let user = await db.query(
            'SELECT * FROM users WHERE telegram_id = $1',
            [telegramId]
        );
        
        if (user.rows.length === 0) {
            // Create new user
            const userReferralCode = `REF${telegramId}`;
            
            await db.query(
                `INSERT INTO users (
                    telegram_id, username, first_name, last_name, referral_code, referrer_id
                ) VALUES ($1, $2, $3, $4, $5, 
                    (SELECT telegram_id FROM users WHERE referral_code = $6)
                )`,
                [
                    telegramId,
                    msg.from.username,
                    msg.from.first_name,
                    msg.from.last_name,
                    userReferralCode,
                    referralCode || null
                ]
            );
            
            // If has referrer, create referral record
            if (referralCode) {
                const referrer = await db.query(
                    'SELECT telegram_id FROM users WHERE referral_code = $1',
                    [referralCode]
                );
                
                if (referrer.rows.length > 0) {
                    await db.query(
                        `INSERT INTO referrals (referrer_id, referred_id)
                         VALUES ($1, $2)`,
                        [referrer.rows[0].telegram_id, telegramId]
                    );
                }
            }
        } else {
            // Update last login
            await db.query(
                'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE telegram_id = $1',
                [telegramId]
            );
        }
        
        // Send welcome message with web app button
        const keyboard = {
            inline_keyboard: [[
                {
                    text: '🎮 Играть в TON SHOOTER',
                    web_app: { url: process.env.WEBAPP_URL }
                }
            ]]
        };
        
        await bot.sendMessage(
            chatId,
            `🎯 Добро пожаловать в TON SHOOTER!\n\n` +
            `Аркадный тайминг-шутер, где ваш навык = ваш доход!\n\n` +
            `✨ Стреляй точно, зарабатывай Coins\n` +
            `💎 Обменивай на Crystals и TON\n` +
            `🚀 Прокачивай оружие и полигон\n` +
            `💰 Выводи TON на свой кошелек\n\n` +
            `Нажми кнопку ниже, чтобы начать!`,
            { reply_markup: keyboard }
        );
        
    } catch (error) {
        console.error('Start command error:', error);
        await bot.sendMessage(
            chatId,
            '❌ Произошла ошибка. Попробуйте позже.'
        );
    }
});

bot.onText(/\/stats/, async (msg) => {
    const telegramId = msg.from.id;
    
    try {
        const user = await db.query(
            `SELECT coins, crystals, ton_balance, total_shots, total_hits, 
                    max_streak, weapon_level, range_level
             FROM users WHERE telegram_id = $1`,
            [telegramId]
        );
        
        if (user.rows.length === 0) {
            await bot.sendMessage(msg.chat.id, 'Сначала запустите /start');
            return;
        }
        
        const u = user.rows[0];
        const accuracy = u.total_shots > 0 
            ? ((u.total_hits / u.total_shots) * 100).toFixed(1) 
            : 0;
        
        await bot.sendMessage(
            msg.chat.id,
            `📊 Ваша статистика:\n\n` +
            `💰 Coins: ${u.coins.toLocaleString()}\n` +
            `💎 Crystals: ${u.crystals}\n` +
            `🪙 TON: ${u.ton_balance}\n\n` +
            `🎯 Всего выстрелов: ${u.total_shots}\n` +
            `✅ Попаданий: ${u.total_hits}\n` +
            `📈 Точность: ${accuracy}%\n` +
            `🔥 Макс. серия: ${u.max_streak}\n\n` +
            `⚔️ Оружие: Уровень ${u.weapon_level}\n` +
            `🎯 Полигон: Уровень ${u.range_level}`
        );
        
    } catch (error) {
        console.error('Stats command error:', error);
        await bot.sendMessage(msg.chat.id, '❌ Ошибка получения статистики');
    }
});

bot.onText(/\/ref/, async (msg) => {
    const telegramId = msg.from.id;
    
    try {
        const user = await db.query(
            'SELECT referral_code FROM users WHERE telegram_id = $1',
            [telegramId]
        );
        
        if (user.rows.length === 0) {
            await bot.sendMessage(msg.chat.id, 'Сначала запустите /start');
            return;
        }
        
        const referralLink = `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}?start=${user.rows[0].referral_code}`;
        
        await bot.sendMessage(
            msg.chat.id,
            `👥 Реферальная программа\n\n` +
            `Приглашайте друзей и получайте награды!\n\n` +
            `💰 250,000 Coins за каждого активного реферала\n\n` +
            `Условия активности реферала:\n` +
            `• Минимум 50 выстрелов\n` +
            `• Минимум 20 попаданий\n` +
            `• Аккаунт старше 24 часов\n\n` +
            `Ваша реферальная ссылка:\n${referralLink}`
        );
        
    } catch (error) {
        console.error('Ref command error:', error);
        await bot.sendMessage(msg.chat.id, '❌ Ошибка получения реферальной ссылки');
    }
});

// API Routes
app.use('/api/user', authMiddleware, userRouter);
app.use('/api/game', authMiddleware, antibotMiddleware, gameRouter);
app.use('/api/upgrades', authMiddleware, upgradeRouter);
app.use('/api/referrals', authMiddleware, referralRouter);
app.use('/api/tasks', authMiddleware, tasksRouter);
app.use('/api/withdrawal', authMiddleware, withdrawalRouter);
app.use('/api/exchange', authMiddleware, exchangeRouter);
app.use('/api/admin', authMiddleware, adminRouter);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 TON SHOOTER server running on port ${PORT}`);
    console.log(`📱 Telegram bot: @${process.env.TELEGRAM_BOT_USERNAME}`);
    console.log(`🌐 WebApp URL: ${process.env.WEBAPP_URL}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, closing server...');
    await db.end();
    process.exit(0);
});
