import express from 'express';
import { db } from '../database/db.js';

export const adminRouter = express.Router();

// Middleware to check admin permissions
const checkAdmin = async (req, res, next) => {
    const telegramId = req.telegramId;
    
    try {
        const admin = await db.query(
            'SELECT * FROM admin_users WHERE telegram_id = $1',
            [telegramId]
        );
        
        if (admin.rows.length === 0) {
            return res.status(403).json({ error: 'Unauthorized: Not an admin' });
        }
        
        req.adminPermissions = admin.rows[0];
        next();
        
    } catch (error) {
        console.error('Admin check error:', error);
        res.status(500).json({ error: 'Failed to verify admin status' });
    }
};

// Apply admin check to all routes
adminRouter.use(checkAdmin);

// Create task
adminRouter.post('/tasks/create', async (req, res) => {
    const telegramId = req.telegramId;
    const { title, description, taskType, channelUsername, channelId, rewardType, rewardAmount } = req.body;
    
    if (!req.adminPermissions.can_manage_tasks) {
        return res.status(403).json({ error: 'Unauthorized: Cannot manage tasks' });
    }
    
    try {
        const result = await db.query(
            `INSERT INTO tasks (
                title, description, task_type, channel_username, channel_id,
                reward_type, reward_amount, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *`,
            [title, description, taskType, channelUsername, channelId, rewardType, rewardAmount, telegramId]
        );
        
        res.json({ 
            success: true, 
            task: result.rows[0] 
        });
        
    } catch (error) {
        console.error('Create task error:', error);
        res.status(500).json({ error: 'Failed to create task' });
    }
});

// Update task
adminRouter.put('/tasks/:taskId', async (req, res) => {
    const taskId = parseInt(req.params.taskId);
    const { title, description, isActive, rewardAmount } = req.body;
    
    if (!req.adminPermissions.can_manage_tasks) {
        return res.status(403).json({ error: 'Unauthorized: Cannot manage tasks' });
    }
    
    try {
        const updates = [];
        const values = [];
        let paramCount = 1;
        
        if (title !== undefined) {
            updates.push(`title = $${paramCount++}`);
            values.push(title);
        }
        if (description !== undefined) {
            updates.push(`description = $${paramCount++}`);
            values.push(description);
        }
        if (isActive !== undefined) {
            updates.push(`is_active = $${paramCount++}`);
            values.push(isActive);
        }
        if (rewardAmount !== undefined) {
            updates.push(`reward_amount = $${paramCount++}`);
            values.push(rewardAmount);
        }
        
        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }
        
        values.push(taskId);
        
        const result = await db.query(
            `UPDATE tasks SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
             WHERE id = $${paramCount}
             RETURNING *`,
            values
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }
        
        res.json({ 
            success: true, 
            task: result.rows[0] 
        });
        
    } catch (error) {
        console.error('Update task error:', error);
        res.status(500).json({ error: 'Failed to update task' });
    }
});

// Delete task
adminRouter.delete('/tasks/:taskId', async (req, res) => {
    const taskId = parseInt(req.params.taskId);
    
    if (!req.adminPermissions.can_manage_tasks) {
        return res.status(403).json({ error: 'Unauthorized: Cannot manage tasks' });
    }
    
    try {
        // Soft delete (set inactive)
        await db.query(
            'UPDATE tasks SET is_active = false WHERE id = $1',
            [taskId]
        );
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('Delete task error:', error);
        res.status(500).json({ error: 'Failed to delete task' });
    }
});

// Get statistics
adminRouter.get('/stats', async (req, res) => {
    if (!req.adminPermissions.can_view_stats) {
        return res.status(403).json({ error: 'Unauthorized: Cannot view stats' });
    }
    
    try {
        const stats = {};
        
        // User stats
        const userStats = await db.query(`
            SELECT 
                COUNT(*) as total_users,
                COUNT(*) FILTER (WHERE last_login_at > NOW() - INTERVAL '24 hours') as dau,
                COUNT(*) FILTER (WHERE last_login_at > NOW() - INTERVAL '7 days') as wau,
                COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as new_today
            FROM users
        `);
        stats.users = userStats.rows[0];
        
        // Game stats
        const gameStats = await db.query(`
            SELECT 
                SUM(total_shots) as total_shots,
                SUM(total_hits) as total_hits,
                ROUND(AVG(CASE WHEN total_shots > 0 THEN (total_hits::float / total_shots * 100) END), 2) as avg_accuracy
            FROM users
        `);
        stats.game = gameStats.rows[0];
        
        // Economy stats
        const economyStats = await db.query(`
            SELECT 
                SUM(coins) as total_coins,
                SUM(crystals) as total_crystals,
                SUM(ton_balance) as total_ton_balance,
                SUM(total_withdrawn) as total_withdrawn
            FROM users
        `);
        stats.economy = economyStats.rows[0];
        
        // Task stats
        const taskStats = await db.query(`
            SELECT 
                COUNT(*) as total_tasks,
                COUNT(*) FILTER (WHERE is_active = true) as active_tasks,
                (SELECT COUNT(*) FROM user_tasks WHERE is_completed = true) as total_completions
            FROM tasks
        `);
        stats.tasks = taskStats.rows[0];
        
        // Referral stats
        const referralStats = await db.query(`
            SELECT 
                COUNT(*) as total_referrals,
                COUNT(*) FILTER (WHERE is_active = true) as active_referrals,
                COUNT(*) FILTER (WHERE reward_claimed = true) as claimed_rewards
            FROM referrals
        `);
        stats.referrals = referralStats.rows[0];
        
        res.json({ stats });
        
    } catch (error) {
        console.error('Get admin stats error:', error);
        res.status(500).json({ error: 'Failed to get statistics' });
    }
});

// Get user details
adminRouter.get('/users/:telegramId', async (req, res) => {
    const telegramId = parseInt(req.params.telegramId);
    
    if (!req.adminPermissions.can_manage_users) {
        return res.status(403).json({ error: 'Unauthorized: Cannot manage users' });
    }
    
    try {
        const user = await db.query(
            'SELECT * FROM users WHERE telegram_id = $1',
            [telegramId]
        );
        
        if (user.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({ user: user.rows[0] });
        
    } catch (error) {
        console.error('Get user details error:', error);
        res.status(500).json({ error: 'Failed to get user details' });
    }
});

// Ban/unban user
adminRouter.post('/users/:telegramId/ban', async (req, res) => {
    const telegramId = parseInt(req.params.telegramId);
    const { ban, reason } = req.body;
    
    if (!req.adminPermissions.can_manage_users) {
        return res.status(403).json({ error: 'Unauthorized: Cannot manage users' });
    }
    
    try {
        await db.query(
            'UPDATE users SET is_bot_suspected = $1 WHERE telegram_id = $2',
            [ban, telegramId]
        );
        
        if (ban) {
            await db.query(
                `INSERT INTO antibot_logs (user_id, detection_type, severity, evidence)
                 VALUES ($1, 'manual_ban', 'critical', $2)`,
                [telegramId, JSON.stringify({ reason, admin: req.telegramId })]
            );
        }
        
        res.json({ 
            success: true,
            action: ban ? 'banned' : 'unbanned'
        });
        
    } catch (error) {
        console.error('Ban/unban user error:', error);
        res.status(500).json({ error: 'Failed to update user status' });
    }
});
