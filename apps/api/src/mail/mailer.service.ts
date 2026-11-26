import { Inject, Injectable, Logger } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";
import { APP_ENV } from "../common/appEnv.js";

export type MailMessage = { to: string; subject: string; text: string; html?: string };

/**
 * Sends transactional email over SMTP. With no SMTP_URL configured (plain local dev),
 * messages are written to the log instead so verification and reset links stay usable.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transport?: Transporter;
  private readonly from: string;

  private readonly production: boolean;

  constructor(@Inject(APP_ENV) env: { SMTP_URL?: string | undefined; MAIL_FROM: string; NODE_ENV?: string }) {
    this.from = env.MAIL_FROM;
    this.production = env.NODE_ENV === "production";
    this.transport = env.SMTP_URL ? nodemailer.createTransport(env.SMTP_URL) : undefined;
  }

  async send(message: MailMessage): Promise<void> {
    if (!this.transport) {
      // The body carries single-use sign-in, reset and invitation links, which are credentials.
      // They are only printed outside production, where this is the stand-in for an inbox.
      this.logger.warn(
        this.production
          ? `SMTP_URL is not set, so this email was NOT delivered: "${message.subject}" to ${message.to}`
          : `SMTP not configured. Email to ${message.to}: ${message.subject}\n${message.text}`
      );
      return;
    }
    await this.transport.sendMail({ from: this.from, ...message });
  }
}
