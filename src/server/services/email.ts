import { EMAIL_RATE_LIMIT_MS, DEFAULT_EMAIL_FROM, EMAIL_ALERT_THRESHOLD } from "@/lib/constants";
import { getRedis } from "@/server/redis";

const ALERT_KEY_PREFIX = "hookrelay:alert:";
const ALERT_TTL_SECONDS = Math.floor(EMAIL_RATE_LIMIT_MS / 1000);

export async function markSent(endpointId: string): Promise<string | null> {
  const redis = getRedis();
  return redis.set(`${ALERT_KEY_PREFIX}${endpointId}`, "1", "EX", ALERT_TTL_SECONDS, "NX");
}

export async function resetRateLimits(): Promise<void> {
  const redis = getRedis();
  const pattern = `${ALERT_KEY_PREFIX}*`;
  const keys: string[] = [];
  let cursor = "0";
  do {
    const [nextCursor, batch] = await redis.scan(
      cursor,
      "MATCH",
      pattern,
      "COUNT",
      100,
    );
    cursor = nextCursor;
    keys.push(...batch);
  } while (cursor !== "0");
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

export async function clearAlertRateLimit(endpointId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`${ALERT_KEY_PREFIX}${endpointId}`);
}

export interface AlertPayload {
  endpointId: string;
  endpointName: string;
  endpointUrl: string;
  failureCount: number;
  lastErrorMessage: string | null;
  dashboardUrl: string;
  userEmail: string;
}

export interface ComposedEmail {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
}

export function composeFailureAlertEmail(alert: AlertPayload): ComposedEmail {
  const subject = `[HookRelay] Endpoint "${alert.endpointName}" has ${alert.failureCount} consecutive failures`;

  const textBody = [
    `HookRelay Delivery Alert`,
    ``,
    `Your endpoint "${alert.endpointName}" is experiencing delivery failures.`,
    ``,
    `Endpoint URL: ${alert.endpointUrl}`,
    `Consecutive Failures: ${alert.failureCount}`,
    `Last Error: ${alert.lastErrorMessage ?? "N/A"}`,
    ``,
    `The endpoint has been marked as degraded. No new deliveries will be attempted until it recovers.`,
    ``,
    `View your dashboard: ${alert.dashboardUrl}`,
    ``,
    `---`,
    `This is an automated alert from HookRelay. You will receive at most one alert per endpoint per hour.`,
  ].join("\n");

  const htmlBody = [
    `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">`,
    `  <h2 style="color: #dc2626; margin-bottom: 4px;">Delivery Alert</h2>`,
    `  <p style="color: #6b7280; margin-top: 0;">Your endpoint is experiencing delivery failures.</p>`,
    `  <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">`,
    `    <tr><td style="padding: 8px 0; font-weight: 600; color: #374151;">Endpoint</td><td style="padding: 8px 0; color: #6b7280;">${escapeHtml(alert.endpointName)}</td></tr>`,
    `    <tr><td style="padding: 8px 0; font-weight: 600; color: #374151;">URL</td><td style="padding: 8px 0; color: #6b7280;"><code style="font-size: 13px;">${escapeHtml(alert.endpointUrl)}</code></td></tr>`,
    `    <tr><td style="padding: 8px 0; font-weight: 600; color: #374151;">Failures</td><td style="padding: 8px 0; color: #dc2626; font-weight: 700;">${escapeHtml(alert.failureCount)} consecutive</td></tr>`,
    `    <tr><td style="padding: 8px 0; font-weight: 600; color: #374151;">Last Error</td><td style="padding: 8px 0; color: #6b7280;">${escapeHtml(alert.lastErrorMessage ?? "N/A")}</td></tr>`,
    `  </table>`,
    `  <p style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 12px; color: #991b1b; font-size: 14px;">The endpoint has been marked as <strong>degraded</strong>. No new deliveries will be attempted until it recovers.</p>`,
    `  <div style="margin: 24px 0; text-align: center;">`,
    `    <a href="${escapeHtml(alert.dashboardUrl)}" style="background: #2563eb; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">View Dashboard</a>`,
    `  </div>`,
    `  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">`,
    `  <p style="color: #9ca3af; font-size: 12px;">This is an automated alert from HookRelay. You will receive at most one alert per endpoint per hour.</p>`,
    `</div>`,
  ].join("\n");

  return {
    to: alert.userEmail,
    from: process.env.EMAIL_FROM ?? DEFAULT_EMAIL_FROM,
    subject,
    text: textBody,
    html: htmlBody,
  };
}

function escapeHtml(str: string | number): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export interface SendResult {
  success: boolean;
  provider: string;
  error?: string;
}

async function sendViaResend(email: ComposedEmail): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { success: false, provider: "resend", error: "RESEND_API_KEY not configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: email.from,
        to: email.to,
        subject: email.subject,
        text: email.text,
        html: email.html,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return { success: false, provider: "resend", error: `HTTP ${response.status}: ${body}` };
    }

    return { success: true, provider: "resend" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, provider: "resend", error: message };
  }
}

async function sendViaLog(email: ComposedEmail): Promise<SendResult> {
  console.log(`[EMAIL] To: ${email.to} | Subject: ${email.subject}`);
  console.log(`[EMAIL] Body: ${email.text}`);
  return { success: true, provider: "log" };
}

export async function sendEmail(email: ComposedEmail): Promise<SendResult> {
  const provider = process.env.EMAIL_PROVIDER ?? "log";
  switch (provider) {
    case "resend":
      return sendViaResend(email);
    case "log":
    default:
      return sendViaLog(email);
  }
}

export async function sendFailureAlert(alert: AlertPayload): Promise<SendResult> {
  if (alert.failureCount < EMAIL_ALERT_THRESHOLD) {
    return { success: false, provider: "skipped", error: "Below alert threshold" };
  }

  const email = composeFailureAlertEmail(alert);
  return sendEmail(email);
}
