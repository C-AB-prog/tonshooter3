import crypto from 'crypto';

export const authMiddleware = (req, res, next) => {
    try {
        // Get Telegram WebApp init data from headers
        const initData = req.headers['x-telegram-init-data'];
        
        if (!initData) {
            return res.status(401).json({ error: 'Unauthorized: No init data' });
        }
        
        // Parse init data
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        params.delete('hash');
        
        // Sort params and create data check string
        const dataCheckString = Array.from(params.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');
        
        // Create secret key
        const secretKey = crypto
            .createHmac('sha256', 'WebAppData')
            .update(process.env.TELEGRAM_BOT_TOKEN)
            .digest();
        
        // Calculate hash
        const calculatedHash = crypto
            .createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex');
        
        // Verify hash
        if (calculatedHash !== hash) {
            return res.status(401).json({ error: 'Unauthorized: Invalid hash' });
        }
        
        // Parse user data
        const userJson = params.get('user');
        if (!userJson) {
            return res.status(401).json({ error: 'Unauthorized: No user data' });
        }
        
        const user = JSON.parse(userJson);
        
        // Check auth_date (not older than 24 hours)
        const authDate = parseInt(params.get('auth_date'));
        const currentTime = Math.floor(Date.now() / 1000);
        
        if (currentTime - authDate > 86400) {
            return res.status(401).json({ error: 'Unauthorized: Auth data expired' });
        }
        
        // Add user to request
        req.telegramUser = user;
        req.telegramId = user.id;
        
        next();
        
    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(401).json({ error: 'Unauthorized: Invalid data' });
    }
};
