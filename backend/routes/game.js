import express from 'express';
import { db } from '../database/db.js';
import { analyzeShotPattern } from '../middleware/antibot.js';

export const gameRouter = express.Router();

// Get game state
gameRouter.get('/state', async (req, res) => {
    const telegramId = req.telegramId;
    
    try {
        // Regenerate energy
        await db.query('SELECT regenerate_energy($1)', [telegramId]);
        
        // Get user state
        const result = await db.query(
            `SELECT energy, max_energy, coins, crystals, ton_balance,
                    weapon_level, range_level, total_shots, total_hits, max_streak
             FROM users WHERE telegram_id = $1`,
            [telegramId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const user = result.rows[0];
        
        // Calculate energy cost and coin reward
        const energyCost = 1 + user.weapon_level + user.range_level;
        const coinReward = 300 + 250 * user.weapon_level + 200 * user.range_level;
        
        res.json({
            energy: user.energy,
            maxEnergy: user.max_energy,
            coins: parseInt(user.coins),
            crystals: user.crystals,
            tonBalance: parseFloat(user.ton_balance),
            weaponLevel: user.weapon_level,
            rangeLevel: user.range_level,
            totalShots: user.total_shots,
            totalHits: user.total_hits,
            maxStreak: user.max_streak,
            energyCost,
            coinReward
        });
        
    } catch (error) {
        console.error('Get game state error:', error);
        res.status(500).json({ error: 'Failed to get game state' });
    }
});

// Fire shot
gameRouter.post('/shoot', async (req, res) => {
    const telegramId = req.telegramId;
    const { 
        sliderPosition, 
        hitZoneLeft, 
        hitZoneRight, 
        clientTimestamp,
        reactionTime,
        sessionId 
    } = req.body;
    
    // Validate input
    if (
        typeof sliderPosition !== 'number' || 
        typeof hitZoneLeft !== 'number' || 
        typeof hitZoneRight !== 'number'
    ) {
        return res.status(400).json({ error: 'Invalid shot data' });
    }
    
    try {
        // Start transaction
        await db.query('BEGIN');
        
        // Regenerate energy
        await db.query('SELECT regenerate_energy($1)', [telegramId]);
        
        // Get user state with lock
        const userResult = await db.query(
            `SELECT energy, weapon_level, range_level, coins, total_shots, total_hits, max_streak
             FROM users WHERE telegram_id = $1 FOR UPDATE`,
            [telegramId]
        );
        
        if (userResult.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ error: 'User not found' });
        }
        
        const user = userResult.rows[0];
        
        // Calculate energy cost
        const energyCost = 1 + user.weapon_level + user.range_level;
        
        // Check if user has enough energy
        if (user.energy < energyCost) {
            await db.query('ROLLBACK');
            return res.status(400).json({ 
                error: 'Not enough energy',
                required: energyCost,
                current: user.energy
            });
        }
        
        // Server-side validation of hit
        const isHit = sliderPosition >= hitZoneLeft && sliderPosition <= hitZoneRight;
        
        // Calculate coin reward
        const coinReward = isHit 
            ? 300 + 250 * user.weapon_level + 200 * user.range_level 
            : 0;
        
        // Update user stats
        const newEnergy = user.energy - energyCost;
        const newCoins = parseInt(user.coins) + coinReward;
        const newTotalShots = user.total_shots + 1;
        const newTotalHits = user.total_hits + (isHit ? 1 : 0);
        
        await db.query(
            `UPDATE users 
             SET energy = $1, coins = $2, total_shots = $3, total_hits = $4,
                 last_energy_update = CURRENT_TIMESTAMP
             WHERE telegram_id = $5`,
            [newEnergy, newCoins, newTotalShots, newTotalHits, telegramId]
        );
        
        // Record shot
        const shotResult = await db.query(
            `INSERT INTO shots (
                user_id, session_id, is_hit, slider_position, 
                hit_zone_left, hit_zone_right, client_timestamp, reaction_time,
                weapon_level, range_level, energy_cost, coins_earned
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING id`,
            [
                telegramId, sessionId, isHit, sliderPosition,
                hitZoneLeft, hitZoneRight, clientTimestamp, reactionTime,
                user.weapon_level, user.range_level, energyCost, coinReward
            ]
        );
        
        await db.query('COMMIT');
        
        // Async: Analyze pattern (don't await)
        analyzeShotPattern(telegramId, {
            sliderPosition,
            reactionTime,
            isHit
        }).catch(err => console.error('Pattern analysis error:', err));
        
        res.json({
            success: true,
            isHit,
            coinReward,
            newEnergy,
            newCoins,
            shotId: shotResult.rows[0].id
        });
        
    } catch (error) {
        await db.query('ROLLBACK');
        console.error('Shoot error:', error);
        res.status(500).json({ error: 'Failed to process shot' });
    }
});

// Start session
gameRouter.post('/session/start', async (req, res) => {
    const telegramId = req.telegramId;
    
    try {
        const result = await db.query(
            `INSERT INTO game_sessions (user_id)
             VALUES ($1)
             RETURNING id, started_at`,
            [telegramId]
        );
        
        res.json({
            sessionId: result.rows[0].id,
            startedAt: result.rows[0].started_at
        });
        
    } catch (error) {
        console.error('Start session error:', error);
        res.status(500).json({ error: 'Failed to start session' });
    }
});

// End session
gameRouter.post('/session/end', async (req, res) => {
    const telegramId = req.telegramId;
    const { sessionId, shots, hits, misses, maxStreak, coinsEarned } = req.body;
    
    try {
        await db.query(
            `UPDATE game_sessions
             SET ended_at = CURRENT_TIMESTAMP, shots = $1, hits = $2, 
                 misses = $3, max_streak = $4, coins_earned = $5
             WHERE id = $6 AND user_id = $7`,
            [shots, hits, misses, maxStreak, coinsEarned, sessionId, telegramId]
        );
        
        // Update user's max streak if needed
        await db.query(
            `UPDATE users
             SET max_streak = GREATEST(max_streak, $1)
             WHERE telegram_id = $2`,
            [maxStreak, telegramId]
        );
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('End session error:', error);
        res.status(500).json({ error: 'Failed to end session' });
    }
});

// Get leaderboard
gameRouter.get('/leaderboard', async (req, res) => {
    const type = req.query.type || 'coins'; // coins, streak, accuracy
    const limit = Math.min(parseInt(req.query.limit) || 100, 100);
    
    try {
        let query;
        
        switch (type) {
            case 'streak':
                query = `
                    SELECT telegram_id, first_name, username, max_streak as score
                    FROM users
                    WHERE max_streak > 0
                    ORDER BY max_streak DESC
                    LIMIT $1
                `;
                break;
            case 'accuracy':
                query = `
                    SELECT telegram_id, first_name, username,
                           ROUND((total_hits::numeric / NULLIF(total_shots, 0) * 100), 2) as score
                    FROM users
                    WHERE total_shots >= 100
                    ORDER BY score DESC
                    LIMIT $1
                `;
                break;
            default: // coins
                query = `
                    SELECT telegram_id, first_name, username, coins as score
                    FROM users
                    WHERE coins > 0
                    ORDER BY coins DESC
                    LIMIT $1
                `;
        }
        
        const result = await db.query(query, [limit]);
        
        res.json({
            type,
            leaderboard: result.rows.map((row, index) => ({
                rank: index + 1,
                username: row.username || row.first_name || 'Anonymous',
                score: type === 'accuracy' ? parseFloat(row.score) : parseInt(row.score)
            }))
        });
        
    } catch (error) {
        console.error('Leaderboard error:', error);
        res.status(500).json({ error: 'Failed to get leaderboard' });
    }
});
