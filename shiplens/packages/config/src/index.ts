function env(key: string, fallback?: string): string {
  const value = process.env[key];
  if (value !== undefined) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable: ${key}`);
}

function envInt(key: string, fallback: number): number {
  const value = process.env[key];
  if (value === undefined) return fallback;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) throw new Error(`Environment variable ${key} must be an integer`);
  return parsed;
}

function envBool(key: string, fallback: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) return fallback;
  return value === "true" || value === "1";
}

export const config = {
  env: env("NODE_ENV", "development"),
  isDev: env("NODE_ENV", "development") === "development",
  isTest: env("NODE_ENV", "development") === "test",
  isProd: env("NODE_ENV", "development") === "production",

  api: {
    port: envInt("API_PORT", 3001),
    host: env("API_HOST", "0.0.0.0"),
  },

  tracker: {
    port: envInt("TRACKER_PORT", 3000),
  },

  admin: {
    port: envInt("ADMIN_PORT", 3002),
  },

  database: {
    url: env("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/shiplens"),
  },

  redis: {
    url: env("REDIS_URL", "redis://localhost:6379"),
  },

  email: {
    resendApiKey: env("RESEND_API_KEY", ""),
  },

  sms: {
    twilioAccountSid: env("TWILIO_ACCOUNT_SID", ""),
    twilioAuthToken: env("TWILIO_AUTH_TOKEN", ""),
    twilioPhoneNumber: env("TWILIO_PHONE_NUMBER", ""),
  },

  storage: {
    r2AccountId: env("R2_ACCOUNT_ID", ""),
    r2AccessKeyId: env("R2_ACCESS_KEY_ID", ""),
    r2SecretAccessKey: env("R2_SECRET_ACCESS_KEY", ""),
    r2BucketName: env("R2_BUCKET_NAME", "shiplens-assets"),
  },

  app: {
    version: env("APP_VERSION", "0.1.0"),
    baseUrl: env("APP_BASE_URL", "http://localhost:3000"),
  },

  rateLimit: {
    max: envInt("RATE_LIMIT_MAX", 100),
    timeWindow: envInt("RATE_LIMIT_WINDOW_MS", 60000),
  },
} as const;

export type Config = typeof config;
