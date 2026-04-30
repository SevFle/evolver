export const APP_NAME = "HookRelay" as const;
export const APP_DESCRIPTION =
  "Reliable webhook infrastructure for SaaS teams" as const;

export const RETRY_SCHEDULE = [60_000, 300_000, 1_800_000, 7_200_000, 43_200_000] as const;
export const MAX_RETRY_ATTEMPTS = 5;

export const CIRCUIT_BREAKER_THRESHOLD = 5;

export const DELIVERY_TIMEOUT_MS = 30_000;

export const MAX_PAYLOAD_SIZE_BYTES = 512 * 1024;
export const MAX_PAYLOAD_RESPONSE_SIZE = 10 * 1024;

export const EMAIL_RATE_LIMIT_MS = 60 * 60 * 1000;
export const DEFAULT_EMAIL_FROM = "alerts@hookrelay.dev";
export const CIRCUIT_RECOVERY_COOLDOWN_MS = 5 * 60 * 1000;

export const EMAIL_ALERT_THRESHOLD = CIRCUIT_BREAKER_THRESHOLD;
