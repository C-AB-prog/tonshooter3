import express from 'express';
import { db } from '../database/db.js';

export const userRouter = express.Router();

// Get user profile
userRouter.get('/profile', async (req, res) => {
    const telegramId = req.telegramId;
    
    try {
        const result = await db.query(
            `SELECT telegram_id, username, first_name, last_name,
                    coins, crystals, ton_balance, energy, max_energy,
                    weapon_level, range_level, total_shots, total_hits, total_misses,
                    max_streak, referral_code, created_at, last_login_at
             FROM users WHERE telegram_id = $1`,
            [telegramId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const user = result.rows[0];
        const accuracy = user.total_shots > 0 
            ? ((user.total_hits / user.total_shots) * 100).toFixed(2)
            : 0;
        
        res.json({
            telegramId: user.telegram_id,
            username: user.username,
            firstName: user.first_name,
            lastName: user.last_name,
            coins: parseInt(user.coins),
            crystals: user.crystals,
            tonBalance: parseFloat(user.ton_balance),
            energy: user.energy,
            maxEnergy: user.max_energy,
            weaponLevel: user.weapon_level,
            rangeLevel: user.range_level,
            stats: {
                totalShots: user.total_shots,
                totalHits: user.total_hits,
                totalMisses: user.total_misses,
                accuracy: parseFloat(accuracy),
                maxStreak: user.max_streak
            },
            referralCode: user.referral_code,
            createdAt: user.created_at,
            lastLoginAt: user.last_login_at
        });
        
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Failed to get profile' });
    }
});

// Update TON wallet
userRouter.post('/wallet', async (req, res) => {
    const telegramId = req.telegramId;
    const { walletAddress } = req.body;
    
    if (!walletAddress || typeof walletAddress !== 'string') {
        return res.status(400).json({ error: 'Invalid wallet address' });
    }
    
    try {
        await db.query(
            'UPDATE users SET ton_wallet_address = $1 WHERE telegram_id = $2',
            [walletAddress, telegramId]
        );
        
        res.json({ success: true, walletAddress });
        
    } catch (error) {
        console.error('Update wallet error:', error);
        res.status(500).json({ error: 'Failed to update wallet' });
    }
});
