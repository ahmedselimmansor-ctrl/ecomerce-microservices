import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import nodemailer, { type Transporter } from 'nodemailer';
import type { RenderedMessage } from './templates.js';

export interface Sender {
  name: string;
  sendEmail(to: string, message: RenderedMessage): Promise<void>;
  sendSms(phone: string, text: string): Promise<void>;
}

/**
 * المُرسِل الإنتاجي: Amazon SES للإيميل و SNS للرسائل النصية.
 * الاعتماد على IRSA — لا مفاتيح وصول في متغيرات البيئة.
 */
export class AwsSender implements Sender {
  readonly name = 'aws';

  private readonly ses: SESClient;
  private readonly sns: SNSClient;

  constructor(
    private readonly region: string,
    private readonly fromAddress: string,
    endpoint?: string,
  ) {
    const common = endpoint ? { region, endpoint } : { region };
    this.ses = new SESClient(common);
    this.sns = new SNSClient(common);
  }

  async sendEmail(to: string, message: RenderedMessage): Promise<void> {
    await this.ses.send(
      new SendEmailCommand({
        Source: this.fromAddress,
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: message.subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: message.html, Charset: 'UTF-8' },
            Text: { Data: message.text, Charset: 'UTF-8' },
          },
        },
      }),
    );
  }

  async sendSms(phone: string, text: string): Promise<void> {
    await this.sns.send(
      new PublishCommand({
        PhoneNumber: phone,
        Message: text,
        MessageAttributes: {
          'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: 'Transactional' },
        },
      }),
    );
  }
}

/**
 * مُرسِل التطوير المحلي: SMTP إلى Mailpit، والرسائل النصية تُسجَّل فقط.
 * وجوده يعني أن مسار الإشعارات يُختبر فعليًا محليًا لا أن يُتجاوز.
 */
export class LocalSender implements Sender {
  readonly name = 'local';

  private readonly transport: Transporter;

  constructor(host: string, port: number, private readonly fromAddress: string) {
    this.transport = nodemailer.createTransport({
      host,
      port,
      secure: false,
      ignoreTLS: true,
    });
  }

  async sendEmail(to: string, message: RenderedMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.fromAddress,
      to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  }

  async sendSms(phone: string, text: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[local-sms] to=${phone} text=${text}`);
  }
}
