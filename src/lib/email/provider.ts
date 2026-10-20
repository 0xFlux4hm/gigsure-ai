/**
 * Email provider abstraction.
 *
 * Supports:
 *   - SMTP (any provider — Gmail, Resend, SendGrid, AWS SES, Mailgun)
 *   - Mock (logs to console — for dev / testing)
 *
 * In production: set SMTP_URL env var.
 *   - Gmail: smtp://you%40gmail.com:app-password@smtp.gmail.com:587
 *   - Resend: smtp://resend:re_xxx@smtp.resend.com:465
 *   - SendGrid: smtp://apikey:SG.xxx@smtp.sendgrid.net:587
 *
 * If SMTP_URL is not set, falls back to console logging (dev mode only).
 */

export interface EmailMessage {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<{ ok: boolean; messageId?: string; error?: string }>;
}

/**
 * Mock provider — logs to console. Used in dev / testing.
 */
class MockEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<{ ok: boolean; messageId?: string; error?: string }> {
    console.log(`\n📧 [mock-email]\nTo: ${message.to}\nFrom: ${message.from}\nSubject: ${message.subject}\nBody: ${message.text ?? message.html ?? "(no body)"}\n`);
    return { ok: true, messageId: `mock_${Date.now()}` };
  }
}

/**
 * SMTP provider — uses Node's nodemailer under the hood.
 * Lazy-loads nodemailer so dev installs don't require it.
 */
class SMTPEmailProvider implements EmailProvider {
  private transporter: { sendMail: (opts: EmailMessage) => Promise<{ messageId: string }> } | null = null;
  private smtpUrl: string;

  constructor(smtpUrl: string) {
    this.smtpUrl = smtpUrl;
  }

  private async getTransporter() {
    if (this.transporter) return this.transporter;
    try {
      const nodemailer = await import("nodemailer");
      this.transporter = nodemailer.createTransport(this.smtpUrl) as unknown as {
        sendMail: (opts: EmailMessage) => Promise<{ messageId: string }>;
      };
      return this.transporter;
    } catch (err) {
      throw new Error(
        `SMTP email provider requires 'nodemailer'. Install with: bun add nodemailer. Original error: ${(err as Error).message}`,
      );
    }
  }

  async send(message: EmailMessage): Promise<{ ok: boolean; messageId?: string; error?: string }> {
    try {
      const transporter = await this.getTransporter();
      const result = await transporter.sendMail(message);
      return { ok: true, messageId: result.messageId };
    } catch (err) {
      const msg = (err as Error).message;
      console.error("[email] SMTP send failed:", msg);
      return { ok: false, error: msg };
    }
  }
}

// Singleton
let _provider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (_provider) return _provider;

  const smtpUrl = process.env.SMTP_URL;
  if (smtpUrl) {
    _provider = new SMTPEmailProvider(smtpUrl);
  } else {
    console.warn("[email] SMTP_URL not set — using mock email provider (logs to console)");
    _provider = new MockEmailProvider();
  }
  return _provider;
}

/**
 * Send a templated email. Returns the raw provider result.
 */
export async function sendEmail(message: EmailMessage): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const provider = getEmailProvider();
  return provider.send(message);
}

// ---------------------------------------------------------------------------
// Templated email helpers
// ---------------------------------------------------------------------------

export function verificationEmail(to: string, verificationUrl: string): EmailMessage {
  const from = process.env.EMAIL_FROM ?? "GigSure AI <noreply@localhost>";
  return {
    to,
    from,
    subject: "Verify your GigSure AI email",
    text: `Welcome to GigSure AI!\n\nPlease verify your email by clicking the link below:\n\n${verificationUrl}\n\nThis link expires in 24 hours.\n\nIf you didn't create an account, you can safely ignore this email.\n\n— GigSure AI team`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h1 style="color: #0F5132;">Welcome to GigSure AI</h1>
        <p>Please verify your email address to complete your registration.</p>
        <p style="margin: 32px 0;">
          <a href="${verificationUrl}" style="background: #0F5132; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block; font-weight: 600;">Verify my email</a>
        </p>
        <p style="color: #6b7280; font-size: 14px;">Or copy this link: ${verificationUrl}</p>
        <p style="color: #6b7280; font-size: 14px;">This link expires in 24 hours.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
        <p style="color: #6b7280; font-size: 12px;">If you didn't create an account, you can safely ignore this email.</p>
        <p style="color: #6b7280; font-size: 12px;">— GigSure AI team</p>
      </div>
    `,
  };
}

export function passwordResetEmail(to: string, resetUrl: string): EmailMessage {
  const from = process.env.EMAIL_FROM ?? "GigSure AI <noreply@localhost>";
  return {
    to,
    from,
    subject: "Reset your GigSure AI password",
    text: `We received a request to reset your password.\n\nClick the link below to set a new password:\n\n${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you didn't request a reset, ignore this email — your password is still safe.\n\n— GigSure AI team`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h1 style="color: #0F5132;">Reset your password</h1>
        <p>We received a request to reset your GigSure AI password.</p>
        <p style="margin: 32px 0;">
          <a href="${resetUrl}" style="background: #0F5132; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block; font-weight: 600;">Reset password</a>
        </p>
        <p style="color: #6b7280; font-size: 14px;">Or copy this link: ${resetUrl}</p>
        <p style="color: #6b7280; font-size: 14px;">This link expires in 1 hour.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
        <p style="color: #6b7280; font-size: 12px;">If you didn't request a reset, ignore this email — your password is still safe.</p>
        <p style="color: #6b7280; font-size: 12px;">— GigSure AI team</p>
      </div>
    `,
  };
}

export function securityNotificationEmail(to: string, subject: string, body: string): EmailMessage {
  const from = process.env.EMAIL_FROM ?? "GigSure AI <noreply@localhost>";
  return {
    to,
    from,
    subject,
    text: body,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #0F5132;">${subject}</h2>
        <p style="white-space: pre-wrap;">${body}</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
        <p style="color: #6b7280; font-size: 12px;">If this wasn't you, please sign in immediately and change your password.</p>
        <p style="color: #6b7280; font-size: 12px;">— GigSure AI security</p>
      </div>
    `,
  };
}
