-- TON SHOOTER Database Schema

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    username VARCHAR(255),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    
    -- Game stats
    coins BIGINT DEFAULT 0 CHECK (coins >= 0),
    crystals INTEGER DEFAULT 0 CHECK (crystals >= 0),
    ton_balance DECIMAL(18, 9) DEFAULT 0 CHECK (ton_balance >= 0),
    
    -- Energy
    energy INTEGER DEFAULT 100 CHECK (energy >= 0 AND energy <= 100),
    max_energy INTEGER DEFAULT 100,
    last_energy_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Levels
    weapon_level INTEGER DEFAULT 1 CHECK (weapon_level >= 1 AND weapon_level <= 10),
    range_level INTEGER DEFAULT 1 CHECK (range_level >= 1 AND range_level <= 10),
    
    -- Game progress
    total_shots INTEGER DEFAULT 0,
    total_hits INTEGER DEFAULT 0,
    total_misses INTEGER DEFAULT 0,
    max_streak INTEGER DEFAULT 0,
    
    -- Referral
    referrer_id BIGINT REFERENCES users(telegram_id),
    referral_code VARCHAR(50) UNIQUE,
    referral_rewards_claimed INTEGER DEFAULT 0,
    
    -- Anti-bot
    is_bot_suspected BOOLEAN DEFAULT FALSE,
    last_action_timestamp TIMESTAMP,
    action_pattern_score INTEGER DEFAULT 0,
    
    -- TON wallet
    ton_wallet_address VARCHAR(255),
    last_withdrawal_at TIMESTAMP,
    total_withdrawn DECIMAL(18, 9) DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT weapon_range_balance CHECK (ABS(weapon_level - range_level) <= 3)
);

-- Game sessions table
CREATE TABLE IF NOT EXISTS game_sessions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
    
    -- Session data
    shots INTEGER DEFAULT 0,
    hits INTEGER DEFAULT 0,
    misses INTEGER DEFAULT 0,
    max_streak INTEGER DEFAULT 0,
    coins_earned BIGINT DEFAULT 0,
    energy_spent INTEGER DEFAULT 0,
    
    -- Timing data for anti-bot
    shot_timings JSONB DEFAULT '[]',
    
    -- Metadata
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    
    -- Indexes
    CONSTRAINT valid_shots CHECK (shots = hits + misses)
);

CREATE INDEX IF NOT EXISTS idx_game_sessions_user ON game_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_created ON game_sessions(started_at DESC);

-- Shots table (for anti-bot analysis)
CREATE TABLE IF NOT EXISTS shots (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
    session_id BIGINT REFERENCES game_sessions(id) ON DELETE CASCADE,
    
    -- Shot data
    is_hit BOOLEAN NOT NULL,
    slider_position DECIMAL(5, 2) NOT NULL CHECK (slider_position >= 0 AND slider_position <= 100),
    hit_zone_left DECIMAL(5, 2) NOT NULL,
    hit_zone_right DECIMAL(5, 2) NOT NULL,
    
    -- Timing (ms from client)
    client_timestamp BIGINT NOT NULL,
    reaction_time INTEGER,
    
    -- Levels at time of shot
    weapon_level INTEGER NOT NULL,
    range_level INTEGER NOT NULL,
    
    -- Energy
    energy_cost INTEGER NOT NULL,
    coins_earned INTEGER DEFAULT 0,
    
    -- Server validation
    server_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_valid BOOLEAN DEFAULT TRUE,
    validation_flags JSONB DEFAULT '{}',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shots_user ON shots(user_id);
CREATE INDEX IF NOT EXISTS idx_shots_created ON shots(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shots_session ON shots(session_id);

-- Upgrades table
CREATE TABLE IF NOT EXISTS upgrades (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
    
    -- Upgrade details
    upgrade_type VARCHAR(50) NOT NULL CHECK (upgrade_type IN ('weapon', 'range')),
    from_level INTEGER NOT NULL,
    to_level INTEGER NOT NULL,
    cost BIGINT NOT NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_upgrades_user ON upgrades(user_id);

-- Boosts table
CREATE TABLE IF NOT EXISTS boosts (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
    
    -- Boost details
    boost_type VARCHAR(50) NOT NULL CHECK (boost_type = 'energy_reduction'),
    duration_minutes INTEGER DEFAULT 10,
    
    -- Payment
    paid_with VARCHAR(20) NOT NULL CHECK (paid_with IN ('crystals', 'ton')),
    cost DECIMAL(18, 9) NOT NULL,
    
    -- Activation
    activated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_boosts_user_active ON boosts(user_id, is_active, expires_at);

-- Referrals table
CREATE TABLE IF NOT EXISTS referrals (
    id BIGSERIAL PRIMARY KEY,
    referrer_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
    referred_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
    
    -- Referral status
    is_active BOOLEAN DEFAULT FALSE,
    shots_made INTEGER DEFAULT 0,
    hits_made INTEGER DEFAULT 0,
    account_age_hours INTEGER DEFAULT 0,
    
    -- Reward
    reward_claimed BOOLEAN DEFAULT FALSE,
    reward_amount BIGINT DEFAULT 250000,
    claimed_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(referrer_id, referred_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_id);

-- Tasks/Missions table
CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    
    -- Task details
    title VARCHAR(255) NOT NULL,
    description TEXT,
    task_type VARCHAR(50) NOT NULL CHECK (task_type IN ('telegram_subscribe', 'custom')),
    
    -- Telegram channel details
    channel_username VARCHAR(255),
    channel_id BIGINT,
    
    -- Rewards
    reward_type VARCHAR(20) NOT NULL CHECK (reward_type IN ('coins', 'crystals')),
    reward_amount INTEGER NOT NULL,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Limits
    max_completions INTEGER,
    current_completions INTEGER DEFAULT 0,
    
    -- Metadata
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tasks_active ON tasks(is_active);

-- User tasks (completions)
CREATE TABLE IF NOT EXISTS user_tasks (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    
    -- Completion
    is_completed BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMP,
    reward_claimed BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(user_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_user_tasks_user ON user_tasks(user_id);

-- Withdrawals table
CREATE TABLE IF NOT EXISTS withdrawals (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
    
    -- Withdrawal details
    amount DECIMAL(18, 9) NOT NULL CHECK (amount >= 1 AND amount <= 25),
    crystals_spent INTEGER NOT NULL,
    
    -- Wallet
    to_wallet_address VARCHAR(255) NOT NULL,
    
    -- Fee
    developer_fee DECIMAL(18, 9) NOT NULL,
    net_amount DECIMAL(18, 9) NOT NULL,
    
    -- Status
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    
    -- Transaction
    transaction_hash VARCHAR(255),
    blockchain_confirmed BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);

-- Admin users table
CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    username VARCHAR(255),
    
    -- Permissions
    can_manage_tasks BOOLEAN DEFAULT FALSE,
    can_view_stats BOOLEAN DEFAULT FALSE,
    can_manage_users BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Exchange transactions table
CREATE TABLE IF NOT EXISTS exchanges (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
    
    -- Exchange details
    exchange_type VARCHAR(50) NOT NULL CHECK (exchange_type IN ('coins_to_crystals', 'crystals_to_ton')),
    
    -- Amounts
    from_amount BIGINT NOT NULL,
    to_amount DECIMAL(18, 9) NOT NULL,
    exchange_rate VARCHAR(100) NOT NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_exchanges_user ON exchanges(user_id);

-- Anti-bot logs
CREATE TABLE IF NOT EXISTS antibot_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
    
    -- Detection details
    detection_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    
    -- Evidence
    evidence JSONB,
    
    -- Action taken
    action_taken VARCHAR(100),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_antibot_user ON antibot_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_antibot_severity ON antibot_logs(severity, created_at DESC);

-- Functions and Triggers

-- Update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for users table
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger for tasks table
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to regenerate energy
CREATE OR REPLACE FUNCTION regenerate_energy(user_telegram_id BIGINT)
RETURNS INTEGER AS $$
DECLARE
    current_energy INTEGER;
    max_energy INTEGER;
    last_update TIMESTAMP;
    minutes_passed NUMERIC;
    energy_to_add INTEGER;
    new_energy INTEGER;
BEGIN
    SELECT energy, users.max_energy, last_energy_update
    INTO current_energy, max_energy, last_update
    FROM users
    WHERE telegram_id = user_telegram_id;
    
    IF current_energy >= max_energy THEN
        RETURN current_energy;
    END IF;
    
    minutes_passed := EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_update)) / 60;
    energy_to_add := FLOOR(minutes_passed / 5);
    
    IF energy_to_add > 0 THEN
        new_energy := LEAST(current_energy + energy_to_add, max_energy);
        
        UPDATE users
        SET energy = new_energy,
            last_energy_update = CURRENT_TIMESTAMP
        WHERE telegram_id = user_telegram_id;
        
        RETURN new_energy;
    END IF;
    
    RETURN current_energy;
END;
$$ LANGUAGE plpgsql;

-- Function to check referral eligibility
CREATE OR REPLACE FUNCTION check_referral_eligibility(referred_telegram_id BIGINT)
RETURNS BOOLEAN AS $$
DECLARE
    shots INTEGER;
    hits INTEGER;
    account_hours INTEGER;
    is_suspected BOOLEAN;
BEGIN
    SELECT total_shots, total_hits, 
           EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at)) / 3600,
           is_bot_suspected
    INTO shots, hits, account_hours, is_suspected
    FROM users
    WHERE telegram_id = referred_telegram_id;
    
    RETURN shots >= 50 AND hits >= 20 AND account_hours >= 24 AND NOT is_suspected;
END;
$$ LANGUAGE plpgsql;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
CREATE INDEX IF NOT EXISTS idx_users_referrer ON users(referrer_id);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);
