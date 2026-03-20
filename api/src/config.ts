import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  corsOrigin: process.env.CORS_ORIGIN ?? "*",

  botToken: required("BOT_TOKEN"),
  adminIds: (process.env.ADMIN_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  jwtSecret: required("JWT_SECRET"),

  devBypassTg: process.env.DEV_BYPASS_TG === "1",

  devFeeBps: Number(process.env.DEV_FEE_BPS ?? 200), // 2.00%
  referralDailyCap: Number(process.env.REFERRAL_DAILY_CAP ?? 10),

  antibotMinActionMs: Number(process.env.ANTIBOT_MIN_ACTION_MS ?? 120),
  antibotSuspicionThreshold: Number(process.env.ANTIBOT_SUSPICION_THRESHOLD ?? 8),


  tonNetwork: (process.env.TON_NETWORK ?? "testnet") as "mainnet" | "testnet",
  tonReceiverAddress: process.env.TON_RECEIVER_ADDRESS ?? "",
  toncenterApiKey: process.env.TONCENTER_API_KEY ?? "",

  // DEV helpers
  // In development we allow mock TON payments so you can test purchases without blockchain.
  allowMockTon:
    process.env.ALLOW_MOCK_TON === "1" || (process.env.NODE_ENV ?? "development") !== "production",
};
