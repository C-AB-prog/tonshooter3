import express from 'express';
import { db } from '../database/db.js';

export const exchangeRouter = express.Router();

// Exchange Coins to Crystals (100,000 Coins = 1 Crystal)
exchangeRouter.post('/coins-to-crystals', async (req, res) => {
    const telegramId = req.telegramId;
    const { coins } = req.body;
    
    const EXCHANGE_RATE = 100000; // 100k coins = 1 crystal
    
    if (!coins || coins < EXCHANGE_RATE) {
        return res.status(400).json({ 
            error: 'Invalid amount',
            message: `Minimum exchange is ${EXCHANGE_RATE.toLocaleString()} coins`
        });
    }
    
    const crystals = Math.floor(coins / EXCHANGE_RATE);
    const actualCoins = crystals * EXCHANGE_RATE; // Round down to exact exchange
    
    try {
        await db.query('BEGIN');
        
        // Get user with lock
        const user = await db.query(
            'SELECT coins FROM users WHERE telegram_id = $1 FOR UPDATE',
            [telegramId]
        );
        
        if (user.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ error: 'User not found' });
        }
        
        if (parseInt(user.rows[0].coins) < actualCoins) {
            await db.query('ROLLBACK');
            return res.status(400).json({ 
                error: 'Insufficient coins',
                required: actualCoins,
                current: parseInt(user.rows[0].coins)
            });
        }
        
        // Perform exchange
        await db.query(
            `UPDATE users 
             SET coins = coins - $1, crystals = crystals + $2
             WHERE telegram_id = $3`,
            [actualCoins, crystals, telegramId]
        );
        
        // Record exchange
        await db.query(
            `INSERT INTO exchanges (user_id, exchange_type, from_amount, to_amount, exchange_rate)
             VALUES ($1, 'coins_to_crystals', $2, $3, '100000:1')`,
            [telegramId, actualCoins, crystals]
        );
        
        await db.query('COMMIT');
        
        res.json({ 
            success: true,
            coinsSpent: actualCoins,
            crystalsReceived: crystals,
            exchangeRate: `${EXCHANGE_RATE.toLocaleString()}:1`
        });
        
    } catch (error) {
        await db.query('ROLLBACK');
        console.error('Coins to crystals exchange error:', error);
        res.status(500).json({ error: 'Failed to exchange coins' });
    }
});

// Exchange Crystals to TON (100 Crystals = 1 TON)
exchangeRouter.post('/crystals-to-ton', async (req, res) => {
    const telegramId = req.telegramId;
    const { crystals } = req.body;
    
    const EXCHANGE_RATE = 100; // 100 crystals = 1 TON
    
    if (!crystals || crystals < EXCHANGE_RATE) {
        return res.status(400).json({ 
            error: 'Invalid amount',
            message: `Minimum exchange is ${EXCHANGE_RATE} crystals`
        });
    }
    
    const ton = Math.floor(crystals / EXCHANGE_RATE);
    const actualCrystals = ton * EXCHANGE_RATE; // Round down to exact exchange
    
    try {
        await db.query('BEGIN');
        
        // Get user with lock
        const user = await db.query(
            'SELECT crystals FROM users WHERE telegram_id = $1 FOR UPDATE',
            [telegramId]
        );
        
        if (user.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ error: 'User not found' });
        }
        
        if (user.rows[0].crystals < actualCrystals) {
            await db.query('ROLLBACK');
            return res.status(400).json({ 
                error: 'Insufficient crystals',
                required: actualCrystals,
                current: user.rows[0].crystals
            });
        }
        
        // Perform exchange
        await db.query(
            `UPDATE users 
             SET crystals = crystals - $1, ton_balance = ton_balance + $2
             WHERE telegram_id = $3`,
            [actualCrystals, ton, telegramId]
        );
        
        // Record exchange
        await db.query(
            `INSERT INTO exchanges (user_id, exchange_type, from_amount, to_amount, exchange_rate)
             VALUES ($1, 'crystals_to_ton', $2, $3, '100:1')`,
            [telegramId, actualCrystals, ton]
        );
        
        await db.query('COMMIT');
        
        res.json({ 
            success: true,
            crystalsSpent: actualCrystals,
            tonReceived: ton,
            exchangeRate: `${EXCHANGE_RATE}:1`
        });
        
    } catch (error) {
        await db.query('ROLLBACK');
        console.error('Crystals to TON exchange error:', error);
        res.status(500).json({ error: 'Failed to exchange crystals' });
    }
});

// Get exchange rates
exchangeRouter.get('/rates', async (req, res) => {
    res.json({
        coinsTocrystals: {
            rate: '100,000:1',
            description: '100,000 Coins = 1 Crystal'
        },
        crystalsToTon: {
            rate: '100:1',
            description: '100 Crystals = 1 TON'
        },
        coinsToTon: {
            rate: '10,000,000:1',
            description: '10,000,000 Coins = 1 TON'
        }
    });
});

// Get exchange history
exchangeRouter.get('/history', async (req, res) => {
    const telegramId = req.telegramId;
    
    try {
        const exchanges = await db.query(
            `SELECT exchange_type, from_amount, to_amount, exchange_rate, created_at
             FROM exchanges
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT 100`,
            [telegramId]
        );
        
        res.json({ exchanges: exchanges.rows });
        
    } catch (error) {
        console.error('Get exchange history error:', error);
        res.status(500).json({ error: 'Failed to get exchange history' });
    }
});
