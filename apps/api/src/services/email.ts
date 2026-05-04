export interface EmailMessage {
  to: string;
  from: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<EmailResult>;
}

export class ResendEmailProvider implements EmailProvider {
  private apiKey: string;
  private baseUrl = "https://api.resend.com";

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.RESEND_API_KEY ?? "";
  }

  async send(message: EmailMessage): Promise<EmailResult> {
    if (!this.apiKey) {
      return { success: false, error: "RESEND_API_KEY not configured" };
    }

    try {
      const response = await fetch(`${this.baseUrl}/emails`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: message.from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          ...(message.replyTo && { reply_to: message.replyTo }),
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        return {
          success: false,
          error: `Resend API error ${response.status}: ${body}`,
        };
      }

      const data = (await response.json()) as { id: string };
      return { success: true, messageId: data.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error sending email";
      return { success: false, error: message };
    }
  }
}

export class ConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<EmailResult> {
    return {
      success: true,
      messageId: `console-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    };
  }
}

export class EmailService {
  private provider: EmailProvider;
  private defaultFrom: string;

  constructor(provider?: EmailProvider, defaultFrom?: string) {
    this.provider = provider ?? new ConsoleEmailProvider();
    this.defaultFrom = defaultFrom ?? process.env.EMAIL_FROM ?? "ShipLens <notifications@shiplens.app>";
  }

  async send(message: Omit<EmailMessage, "from"> & { from?: string }): Promise<EmailResult> {
    return this.provider.send({
      ...message,
      from: message.from ?? this.defaultFrom,
    });
  }

  getDefaultFrom(): string {
    return this.defaultFrom;
  }
}

export function createEmailProvider(): EmailProvider {
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey && apiKey.trim().length > 0 && !apiKey.startsWith("reSEND_KEY")) {
    return new ResendEmailProvider(apiKey);
  }
  return new ConsoleEmailProvider();
}
