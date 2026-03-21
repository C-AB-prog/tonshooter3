import express from 'express';
import { db } from '../database/db.js';

export const upgradeRouter = express.Router();

// Upgrade costs from TZ
const UPGRADE_COSTS = {
    1: 50000,
    2: 120000,
    3: 300000,
    4: 800000,
    5: 2000000,
    6: 5000000,
    7: 12000000,
    8: 25000000,
    9: 50000000
};

// Get available upgrades
upgradeRouter.get('/available', async (req, res) => {
    const telegramId = req.telegramId;
    
    try {
        const result = await db.query(
            'SELECT weapon_level, range_level, coins FROM users WHERE telegram_id = $1',
            [telegramId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const user = result.rows[0];
        const coins = parseInt(user.coins);
        
        // Check weapon upgrade
        const weaponUpgrade = {
            type: 'weapon',
            currentLevel: user.weapon_level,
            nextLevel: user.weapon_level + 1,
            cost: UPGRADE_COSTS[user.weapon_level] || null,
            available: false,
            reason: null
        };
        
        if (user.weapon_level >= 10) {
            weaponUpgrade.reason = 'Max level reached';
        } else if (Math.abs(user.weapon_level + 1 - user.range_level) > 3) {
            weaponUpgrade.reason = 'Would exceed level balance (max diff: 3)';
        } else if (coins < weaponUpgrade.cost) {
            weaponUpgrade.reason = 'Not enough coins';
        } else {
            weaponUpgrade.available = true;
        }
        
        // Check range upgrade
        const rangeUpgrade = {
            type: 'range',
            currentLevel: user.range_level,
            nextLevel: user.range_level + 1,
            cost: UPGRADE_COSTS[user.range_level] || null,
            available: false,
            reason: null
        };
        
        if (user.range_level >= 10) {
            rangeUpgrade.reason = 'Max level reached';
        } else if (Math.abs(user.weapon_level - (user.range_level + 1)) > 3) {
            rangeUpgrade.reason = 'Would exceed level balance (max diff: 3)';
        } else if (coins < rangeUpgrade.cost) {
            rangeUpgrade.reason = 'Not enough coins';
        } else {
            rangeUpgrade.available = true;
        }
        
        res.json({
            coins,
            upgrades: {
                weapon: weaponUpgrade,
                range: rangeUpgrade
            }
        });
        
    } catch (error) {
        console.error('Get upgrades error:', error);
        res.status(500).json({ error: 'Failed to get upgrades' });
    }
});

// Purchase upgrade
upgradeRouter.post('/purchase', async (req, res) => {
    const telegramId = req.telegramId;
    const { upgradeType } = req.body;
    
    if (!['weapon', 'range'].includes(upgradeType)) {
        return res.status(400).json({ error: 'Invalid upgrade type' });
    }
    
    try {
        await db.query('BEGIN');
        
        // Get user with lock
        const userResult = await db.query(
            'SELECT weapon_level, range_level, coins FROM users WHERE telegram_id = $1 FOR UPDATE',
            [telegramId]
        );
        
        if (userResult.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ error: 'User not found' });
        }
        
        const user = userResult.rows[0];
        const currentLevel = upgradeType === 'weapon' ? user.weapon_level : user.range_level;
        const otherLevel = upgradeType === 'weapon' ? user.range_level : user.weapon_level;
        
        // Validate upgrade
        if (currentLevel >= 10) {
            await db.query('ROLLBACK');
            return res.status(400).json({ error: 'Max level reached' });
        }
        
        const newLevel = currentLevel + 1;
        
        // Check level balance
        if (Math.abs(newLevel - otherLevel) > 3) {
            await db.query('ROLLBACK');
            return res.status(400).json({ 
                error: 'Level balance exceeded',
                message: 'Difference between weapon and range levels cannot exceed 3'
            });
        }
        
        const cost = UPGRADE_COSTS[currentLevel];
        
        if (!cost) {
            await db.query('ROLLBACK');
            return res.status(400).json({ error: 'Invalid upgrade level' });
        }
        
        if (parseInt(user.coins) < cost) {
            await db.query('ROLLBACK');
            return res.status(400).json({ 
                error: 'Not enough coins',
                required: cost,
                current: parseInt(user.coins)
            });
        }
        
        // Perform upgrade
        const columnName = upgradeType === 'weapon' ? 'weapon_level' : 'range_level';
        const newCoins = parseInt(user.coins) - cost;
        
        await db.query(
            `UPDATE users SET ${columnName} = $1, coins = $2 WHERE telegram_id = $3`,
            [newLevel, newCoins, telegramId]
        );
        
        // Record upgrade
        await db.query(
            `INSERT INTO upgrades (user_id, upgrade_type, from_level, to_level, cost)
             VALUES ($1, $2, $3, $4, $5)`,
            [telegramId, upgradeType, currentLevel, newLevel, cost]
        );
        
        await db.query('COMMIT');
        
        res.json({
            success: true,
            upgradeType,
            newLevel,
            cost,
            remainingCoins: newCoins
        });
        
    } catch (error) {
        await db.query('ROLLBACK');
        console.error('Purchase upgrade error:', error);
        res.status(500).json({ error: 'Failed to purchase upgrade' });
    }
});
