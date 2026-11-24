import { Inject, Injectable, Logger } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";
import { APP_ENV } from "../shared/app-env.js";

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

  constructor(@Inject(APP_ENV) env: { SMTP_URL?: string; MAIL_FROM: string }) {
    this.from = env.MAIL_FROM;
    this.transport = env.SMTP_URL ? nodemailer.createTransport(env.SMTP_URL) : undefined;
  }

  async send(message: MailMessage): Promise<void> {
    if (!this.transport) {
      this.logger.warn(`SMTP not configured. Email to ${message.to}: ${message.subject}\n${message.text}`);
      return;
    }
    await this.transport.sendMail({ from: this.from, ...message });
  }
}
