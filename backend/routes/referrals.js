import express from 'express';
import { db } from '../database/db.js';

export const referralRouter = express.Router();

// Get referral stats
referralRouter.get('/stats', async (req, res) => {
    const telegramId = req.telegramId;
    
    try {
        const stats = await db.query(
            `SELECT COUNT(*) as total,
                    COUNT(*) FILTER (WHERE is_active = true) as active,
                    COALESCE(SUM(reward_amount) FILTER (WHERE reward_claimed = true), 0) as total_earned
             FROM referrals WHERE referrer_id = $1`,
            [telegramId]
        );
        
        const referrals = await db.query(
            `SELECT r.referred_id, u.username, u.first_name, r.is_active, 
                    r.reward_claimed, r.shots_made, r.hits_made, r.created_at
             FROM referrals r
             JOIN users u ON u.telegram_id = r.referred_id
             WHERE r.referrer_id = $1
             ORDER BY r.created_at DESC`,
            [telegramId]
        );
        
        res.json({
            total: parseInt(stats.rows[0].total),
            active: parseInt(stats.rows[0].active),
            totalEarned: parseInt(stats.rows[0].total_earned),
            referrals: referrals.rows
        });
    } catch (error) {
        console.error('Referral stats error:', error);
        res.status(500).json({ error: 'Failed to get referral stats' });
    }
});

// Claim referral reward
referralRouter.post('/claim/:referralId', async (req, res) => {
    const telegramId = req.telegramId;
    const referralId = parseInt(req.params.referralId);
    
    try {
        await db.query('BEGIN');
        
        // Get referral
        const referral = await db.query(
            `SELECT * FROM referrals 
             WHERE id = $1 AND referrer_id = $2 
             FOR UPDATE`,
            [referralId, telegramId]
        );
        
        if (referral.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ error: 'Referral not found' });
        }
        
        const ref = referral.rows[0];
        
        if (ref.reward_claimed) {
            await db.query('ROLLBACK');
            return res.status(400).json({ error: 'Reward already claimed' });
        }
        
        // Check if referral is active
        const isEligible = await db.query(
            'SELECT check_referral_eligibility($1) as eligible',
            [ref.referred_id]
        );
        
        if (!isEligible.rows[0].eligible) {
            await db.query('ROLLBACK');
            return res.status(400).json({ 
                error: 'Referral not eligible yet',
                message: 'Referral must make 50 shots, 20 hits, and account age 24+ hours'
            });
        }
        
        // Check daily limit
        const todayClaims = await db.query(
            `SELECT COUNT(*) as count FROM referrals
             WHERE referrer_id = $1 
             AND reward_claimed = true 
             AND claimed_at > CURRENT_DATE`,
            [telegramId]
        );
        
        const maxPerDay = parseInt(process.env.MAX_REFERRAL_REWARDS_PER_DAY) || 10;
        
        if (parseInt(todayClaims.rows[0].count) >= maxPerDay) {
            await db.query('ROLLBACK');
            return res.status(400).json({ 
                error: 'Daily limit reached',
                message: `Maximum ${maxPerDay} referral rewards per day`
            });
        }
        
        // Claim reward
        await db.query(
            `UPDATE referrals 
             SET reward_claimed = true, claimed_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [referralId]
        );
        
        await db.query(
            'UPDATE users SET coins = coins + $1 WHERE telegram_id = $2',
            [ref.reward_amount, telegramId]
        );
        
        await db.query('COMMIT');
        
        res.json({ 
            success: true, 
            reward: ref.reward_amount 
        });
        
    } catch (error) {
        await db.query('ROLLBACK');
        console.error('Claim referral error:', error);
        res.status(500).json({ error: 'Failed to claim referral reward' });
    }
});
