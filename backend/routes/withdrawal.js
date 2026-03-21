import express from 'express';
import { db } from '../database/db.js';

export const withdrawalRouter = express.Router();

// Request withdrawal
withdrawalRouter.post('/request', async (req, res) => {
    const telegramId = req.telegramId;
    const { amount } = req.body;
    
    const MIN_WITHDRAWAL = parseFloat(process.env.MIN_WITHDRAWAL_TON) || 1;
    const MAX_WITHDRAWAL = parseFloat(process.env.MAX_WITHDRAWAL_TON) || 25;
    
    // Validate amount
    if (!amount || amount < MIN_WITHDRAWAL || amount > MAX_WITHDRAWAL) {
        return res.status(400).json({ 
            error: 'Invalid amount',
            message: `Amount must be between ${MIN_WITHDRAWAL} and ${MAX_WITHDRAWAL} TON`
        });
    }
    
    try {
        await db.query('BEGIN');
        
        // Get user with lock
        const user = await db.query(
            `SELECT ton_balance, ton_wallet_address, last_withdrawal_at
             FROM users WHERE telegram_id = $1 FOR UPDATE`,
            [telegramId]
        );
        
        if (user.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ error: 'User not found' });
        }
        
        const u = user.rows[0];
        
        // Check wallet address
        if (!u.ton_wallet_address) {
            await db.query('ROLLBACK');
            return res.status(400).json({ 
                error: 'No wallet address',
                message: 'Please set your TON wallet address first'
            });
        }
        
        // Check cooldown (24 hours)
        if (u.last_withdrawal_at) {
            const hoursSince = (Date.now() - new Date(u.last_withdrawal_at)) / (1000 * 60 * 60);
            const cooldownHours = parseInt(process.env.WITHDRAWAL_COOLDOWN_HOURS) || 24;
            
            if (hoursSince < cooldownHours) {
                await db.query('ROLLBACK');
                return res.status(400).json({ 
                    error: 'Withdrawal cooldown active',
                    hoursRemaining: Math.ceil(cooldownHours - hoursSince),
                    message: `You can withdraw again in ${Math.ceil(cooldownHours - hoursSince)} hours`
                });
            }
        }
        
        // Check balance
        if (parseFloat(u.ton_balance) < amount) {
            await db.query('ROLLBACK');
            return res.status(400).json({ 
                error: 'Insufficient balance',
                required: amount,
                current: parseFloat(u.ton_balance)
            });
        }
        
        // Calculate fee
        const feePercent = parseFloat(process.env.DEVELOPER_FEE_PERCENT) || 5;
        const fee = amount * (feePercent / 100);
        const netAmount = amount - fee;
        const crystalsSpent = amount * 100; // 100 crystals = 1 TON
        
        // Create withdrawal record
        const withdrawal = await db.query(
            `INSERT INTO withdrawals (
                user_id, amount, crystals_spent, to_wallet_address, 
                developer_fee, net_amount, status
            ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')
            RETURNING id`,
            [telegramId, amount, crystalsSpent, u.ton_wallet_address, fee, netAmount]
        );
        
        // Update user balance and last withdrawal timestamp
        await db.query(
            `UPDATE users 
             SET ton_balance = ton_balance - $1, 
                 last_withdrawal_at = CURRENT_TIMESTAMP,
                 total_withdrawn = total_withdrawn + $1
             WHERE telegram_id = $2`,
            [amount, telegramId]
        );
        
        await db.query('COMMIT');
        
        res.json({ 
            success: true,
            withdrawalId: withdrawal.rows[0].id,
            amount,
            fee,
            netAmount,
            toAddress: u.ton_wallet_address,
            status: 'pending',
            message: 'Withdrawal request created. Processing may take up to 24 hours.'
        });
        
    } catch (error) {
        await db.query('ROLLBACK');
        console.error('Withdrawal request error:', error);
        res.status(500).json({ error: 'Failed to process withdrawal request' });
    }
});

// Get withdrawal history
withdrawalRouter.get('/history', async (req, res) => {
    const telegramId = req.telegramId;
    
    try {
        const withdrawals = await db.query(
            `SELECT id, amount, developer_fee, net_amount, to_wallet_address,
                    status, transaction_hash, created_at, processed_at
             FROM withdrawals
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT 50`,
            [telegramId]
        );
        
        res.json({ withdrawals: withdrawals.rows });
        
    } catch (error) {
        console.error('Get withdrawal history error:', error);
        res.status(500).json({ error: 'Failed to get withdrawal history' });
    }
});

// Get withdrawal status
withdrawalRouter.get('/status/:withdrawalId', async (req, res) => {
    const telegramId = req.telegramId;
    const withdrawalId = parseInt(req.params.withdrawalId);
    
    try {
        const withdrawal = await db.query(
            `SELECT * FROM withdrawals
             WHERE id = $1 AND user_id = $2`,
            [withdrawalId, telegramId]
        );
        
        if (withdrawal.rows.length === 0) {
            return res.status(404).json({ error: 'Withdrawal not found' });
        }
        
        res.json({ withdrawal: withdrawal.rows[0] });
        
    } catch (error) {
        console.error('Get withdrawal status error:', error);
        res.status(500).json({ error: 'Failed to get withdrawal status' });
    }
});
