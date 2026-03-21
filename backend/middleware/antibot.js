import { db } from '../database/db.js';

const MIN_ACTION_INTERVAL = parseInt(process.env.MIN_ACTION_INTERVAL_MS) || 100;
const PATTERN_THRESHOLD = 10; // Suspicious pattern score threshold

export const antibotMiddleware = async (req, res, next) => {
    const telegramId = req.telegramId;
    
    try {
        // Get user's last action
        const result = await db.query(
            `SELECT last_action_timestamp, action_pattern_score, is_bot_suspected
             FROM users WHERE telegram_id = $1`,
            [telegramId]
        );
        
        if (result.rows.length === 0) {
            return next();
        }
        
        const user = result.rows[0];
        
        // Check if user is already suspected
        if (user.is_bot_suspected) {
            await logAntibot(telegramId, 'blocked_suspected_bot', 'high', {
                reason: 'User already flagged as bot'
            });
            
            return res.status(403).json({ 
                error: 'Account suspended',
                message: 'Suspicious activity detected. Please contact support.'
            });
        }
        
        const now = new Date();
        
        // Check minimum interval between actions
        if (user.last_action_timestamp) {
            const timeDiff = now - new Date(user.last_action_timestamp);
            
            if (timeDiff < MIN_ACTION_INTERVAL) {
                await logAntibot(telegramId, 'too_fast_actions', 'medium', {
                    interval_ms: timeDiff,
                    min_required: MIN_ACTION_INTERVAL
                });
                
                // Increase pattern score
                const newScore = (user.action_pattern_score || 0) + 2;
                await updatePatternScore(telegramId, newScore);
                
                if (newScore >= PATTERN_THRESHOLD) {
                    await flagAsSuspected(telegramId);
                    return res.status(429).json({ 
                        error: 'Too many requests',
                        message: 'Please slow down'
                    });
                }
            }
        }
        
        // Update last action timestamp
        await db.query(
            'UPDATE users SET last_action_timestamp = $1 WHERE telegram_id = $2',
            [now, telegramId]
        );
        
        // Store timing for pattern analysis (in request)
        req.actionTimestamp = now;
        
        next();
        
    } catch (error) {
        console.error('Antibot middleware error:', error);
        next(); // Don't block on error
    }
};

// Analyze shot patterns (called from game routes)
export const analyzeShotPattern = async (telegramId, shotData) => {
    try {
        // Get recent shots
        const recentShots = await db.query(
            `SELECT slider_position, reaction_time, created_at
             FROM shots
             WHERE user_id = $1 AND created_at > NOW() - INTERVAL '5 minutes'
             ORDER BY created_at DESC
             LIMIT 50`,
            [telegramId]
        );
        
        if (recentShots.rows.length < 20) {
            return { isSuspicious: false };
        }
        
        const shots = recentShots.rows;
        let suspicionFlags = [];
        
        // 1. Check for identical timing patterns
        const timings = shots.map(s => s.reaction_time).filter(t => t !== null);
        if (timings.length > 10) {
            const uniqueTimings = new Set(timings);
            if (uniqueTimings.size < timings.length * 0.3) {
                suspicionFlags.push('identical_timings');
            }
        }
        
        // 2. Check for perfect accuracy at high speed
        const avgReactionTime = timings.reduce((a, b) => a + b, 0) / timings.length;
        if (avgReactionTime < 200 && shots.length > 30) {
            const hitRate = shots.filter(s => {
                return s.slider_position >= 45 && s.slider_position <= 55;
            }).length / shots.length;
            
            if (hitRate > 0.95) {
                suspicionFlags.push('inhuman_accuracy');
            }
        }
        
        // 3. Check for robotic intervals
        const intervals = [];
        for (let i = 1; i < shots.length; i++) {
            const diff = new Date(shots[i-1].created_at) - new Date(shots[i].created_at);
            intervals.push(diff);
        }
        
        if (intervals.length > 10) {
            const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
            const variance = intervals.reduce((sum, val) => {
                return sum + Math.pow(val - avgInterval, 2);
            }, 0) / intervals.length;
            const stdDev = Math.sqrt(variance);
            
            // Very low variance = robotic
            if (stdDev < avgInterval * 0.1) {
                suspicionFlags.push('robotic_intervals');
            }
        }
        
        // 4. Check for impossible precision
        const positions = shots.map(s => s.slider_position);
        const positionVariance = positions.reduce((sum, val) => {
            const avg = positions.reduce((a, b) => a + b, 0) / positions.length;
            return sum + Math.pow(val - avg, 2);
        }, 0) / positions.length;
        
        if (positionVariance < 1 && shots.length > 20) {
            suspicionFlags.push('impossible_precision');
        }
        
        // Log if suspicious
        if (suspicionFlags.length > 0) {
            const severity = suspicionFlags.length >= 3 ? 'critical' : 
                           suspicionFlags.length >= 2 ? 'high' : 'medium';
            
            await logAntibot(telegramId, 'suspicious_pattern', severity, {
                flags: suspicionFlags,
                shots_analyzed: shots.length,
                avg_reaction_time: avgReactionTime
            });
            
            // Update pattern score
            const scoreIncrease = suspicionFlags.length * 3;
            await updatePatternScore(telegramId, scoreIncrease, true);
            
            return {
                isSuspicious: true,
                flags: suspicionFlags,
                severity
            };
        }
        
        return { isSuspicious: false };
        
    } catch (error) {
        console.error('Shot pattern analysis error:', error);
        return { isSuspicious: false };
    }
};

// Helper functions
async function logAntibot(telegramId, detectionType, severity, evidence) {
    await db.query(
        `INSERT INTO antibot_logs (user_id, detection_type, severity, evidence)
         VALUES ($1, $2, $3, $4)`,
        [telegramId, detectionType, severity, JSON.stringify(evidence)]
    );
}

async function updatePatternScore(telegramId, increase, isAdditive = false) {
    if (isAdditive) {
        await db.query(
            `UPDATE users 
             SET action_pattern_score = action_pattern_score + $1
             WHERE telegram_id = $2`,
            [increase, telegramId]
        );
    } else {
        await db.query(
            `UPDATE users 
             SET action_pattern_score = $1
             WHERE telegram_id = $2`,
            [increase, telegramId]
        );
    }
    
    // Check if threshold exceeded
    const result = await db.query(
        'SELECT action_pattern_score FROM users WHERE telegram_id = $1',
        [telegramId]
    );
    
    if (result.rows[0]?.action_pattern_score >= PATTERN_THRESHOLD) {
        await flagAsSuspected(telegramId);
    }
}

async function flagAsSuspected(telegramId) {
    await db.query(
        'UPDATE users SET is_bot_suspected = TRUE WHERE telegram_id = $1',
        [telegramId]
    );
    
    await logAntibot(telegramId, 'user_flagged', 'critical', {
        reason: 'Pattern score exceeded threshold'
    });
}
