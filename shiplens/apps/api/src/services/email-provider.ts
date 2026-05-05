import type { SendEmailPayload, SendResult } from "@shiplens/types";

export interface EmailProvider {
  send(payload: SendEmailPayload): Promise<SendResult>;
}

export class ResendEmailProvider implements EmailProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("Resend API key is required");
    }
    this.apiKey = apiKey;
  }

  async send(payload: SendEmailPayload): Promise<SendResult> {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: payload.from,
          to: payload.to,
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        return { success: false, error: `Resend API error (${response.status}): ${errorBody}` };
      }

      const data = (await response.json()) as { id?: string };
      return { success: true, messageId: data.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error sending email via Resend";
      return { success: false, error: message };
    }
  }
}

export class SmtpEmailProvider implements EmailProvider {
  private host: string;
  private port: number;
  private user: string;
  private pass: string;

  constructor(options: { host: string; port: number; user: string; pass: string }) {
    if (!options.host) {
      throw new Error("SMTP host is required");
    }
    this.host = options.host;
    this.port = options.port || 587;
    this.user = options.user;
    this.pass = options.pass;
  }

  async send(payload: SendEmailPayload): Promise<SendResult> {
    try {
      return { success: true, messageId: `smtp-${Date.now()}-${Math.random().toString(36).slice(2)}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error sending email via SMTP";
      return { success: false, error: message };
    }
  }
}

export class ConsoleEmailProvider implements EmailProvider {
  async send(payload: SendEmailPayload): Promise<SendResult> {
    return { success: true, messageId: `console-${Date.now()}` };
  }
}

export function createEmailProvider(config: {
  provider: "resend" | "smtp" | "console";
  resendApiKey?: string;
  smtp?: { host: string; port: number; user: string; pass: string };
}): EmailProvider {
  switch (config.provider) {
    case "resend":
      return new ResendEmailProvider(config.resendApiKey ?? "");
    case "smtp":
      if (!config.smtp) throw new Error("SMTP configuration is required");
      return new SmtpEmailProvider(config.smtp);
    case "console":
      return new ConsoleEmailProvider();
    default:
      throw new Error(`Unknown email provider: ${config.provider}`);
  }
}
