import express from 'express';
import { db } from '../database/db.js';
import TelegramBot from 'node-telegram-bot-api';

export const tasksRouter = express.Router();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);

// Get available tasks
tasksRouter.get('/list', async (req, res) => {
    const telegramId = req.telegramId;
    
    try {
        const tasks = await db.query(
            `SELECT t.id, t.title, t.description, t.task_type, 
                    t.channel_username, t.reward_type, t.reward_amount,
                    ut.is_completed, ut.reward_claimed
             FROM tasks t
             LEFT JOIN user_tasks ut ON ut.task_id = t.id AND ut.user_id = $1
             WHERE t.is_active = true
             ORDER BY t.created_at DESC`,
            [telegramId]
        );
        
        res.json({ tasks: tasks.rows });
    } catch (error) {
        console.error('Get tasks error:', error);
        res.status(500).json({ error: 'Failed to get tasks' });
    }
});

// Verify task completion
tasksRouter.post('/verify/:taskId', async (req, res) => {
    const telegramId = req.telegramId;
    const taskId = parseInt(req.params.taskId);
    
    try {
        // Get task
        const taskResult = await db.query(
            'SELECT * FROM tasks WHERE id = $1 AND is_active = true',
            [taskId]
        );
        
        if (taskResult.rows.length === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }
        
        const task = taskResult.rows[0];
        
        // Check if already completed
        const existing = await db.query(
            'SELECT * FROM user_tasks WHERE user_id = $1 AND task_id = $2',
            [telegramId, taskId]
        );
        
        if (existing.rows.length > 0 && existing.rows[0].is_completed) {
            return res.status(400).json({ error: 'Task already completed' });
        }
        
        // Verify based on task type
        let verified = false;
        
        if (task.task_type === 'telegram_subscribe') {
            // Verify Telegram channel subscription
            try {
                const member = await bot.getChatMember(task.channel_username, telegramId);
                verified = ['member', 'administrator', 'creator'].includes(member.status);
            } catch (error) {
                console.error('Telegram verification error:', error);
                verified = false;
            }
        }
        
        if (!verified) {
            return res.status(400).json({ 
                error: 'Task not completed',
                message: 'Please complete the task first'
            });
        }
        
        // Mark as completed
        await db.query('BEGIN');
        
        if (existing.rows.length > 0) {
            await db.query(
                `UPDATE user_tasks 
                 SET is_completed = true, verified_at = CURRENT_TIMESTAMP
                 WHERE user_id = $1 AND task_id = $2`,
                [telegramId, taskId]
            );
        } else {
            await db.query(
                `INSERT INTO user_tasks (user_id, task_id, is_completed, verified_at)
                 VALUES ($1, $2, true, CURRENT_TIMESTAMP)`,
                [telegramId, taskId]
            );
        }
        
        await db.query('COMMIT');
        
        res.json({ 
            success: true,
            verified: true
        });
        
    } catch (error) {
        await db.query('ROLLBACK');
        console.error('Verify task error:', error);
        res.status(500).json({ error: 'Failed to verify task' });
    }
});

// Claim task reward
tasksRouter.post('/claim/:taskId', async (req, res) => {
    const telegramId = req.telegramId;
    const taskId = parseInt(req.params.taskId);
    
    try {
        await db.query('BEGIN');
        
        // Get task and user_task
        const result = await db.query(
            `SELECT t.*, ut.is_completed, ut.reward_claimed
             FROM tasks t
             JOIN user_tasks ut ON ut.task_id = t.id
             WHERE t.id = $1 AND ut.user_id = $2
             FOR UPDATE`,
            [taskId, telegramId]
        );
        
        if (result.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ error: 'Task not found or not completed' });
        }
        
        const task = result.rows[0];
        
        if (!task.is_completed) {
            await db.query('ROLLBACK');
            return res.status(400).json({ error: 'Task not completed' });
        }
        
        if (task.reward_claimed) {
            await db.query('ROLLBACK');
            return res.status(400).json({ error: 'Reward already claimed' });
        }
        
        // Give reward
        const column = task.reward_type === 'coins' ? 'coins' : 'crystals';
        
        await db.query(
            `UPDATE users SET ${column} = ${column} + $1 WHERE telegram_id = $2`,
            [task.reward_amount, telegramId]
        );
        
        await db.query(
            `UPDATE user_tasks 
             SET reward_claimed = true
             WHERE user_id = $1 AND task_id = $2`,
            [telegramId, taskId]
        );
        
        await db.query('COMMIT');
        
        res.json({ 
            success: true,
            rewardType: task.reward_type,
            rewardAmount: task.reward_amount
        });
        
    } catch (error) {
        await db.query('ROLLBACK');
        console.error('Claim task reward error:', error);
        res.status(500).json({ error: 'Failed to claim reward' });
    }
});
