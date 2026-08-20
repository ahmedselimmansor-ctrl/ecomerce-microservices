import { PubSub, type Topic } from '@google-cloud/pubsub';
import sgMail from '@sendgrid/mail';
import nodemailer, { type Transporter } from 'nodemailer';
import type { RenderedMessage } from './templates.js';

export interface Sender {
  name: string;
  sendEmail(to: string, message: RenderedMessage): Promise<void>;
  sendSms(phone: string, text: string): Promise<void>;
}

/**
 * المُرسِل الإنتاجي: SendGrid للإيميل و Pub/Sub للرسائل النصية.
 *
 * ‏Google Cloud لا تقدّم خدمة إرسال بريد على الإطلاق — لا مقابل لها هنا —
 * فالبريد يخرج عبر SendGrid، وهو الطريق الذي توصي به Google نفسها. ثمن ذلك
 * مفتاح API يعيش في Secret Manager بدل هوية عمل خالصة، وهو الاستثناء
 * الوحيد الذي نقبله في هذه الخدمة.
 *
 * والرسائل النصية كذلك بلا مقابل مُدار: ننشرها على طوبيك Pub/Sub تستهلكه
 * بوّابة SMS خارجية. النداء المتزامن لمزوّد خارجي كان سيربط استهلاك Kafka
 * بتوفّر ذلك المزوّد؛ بالنشر تبقى الرسالة محفوظة ويُعاد تسليمها بعد تعافيه
 * بدل أن تضيع في محاولة فاشلة.
 *
 * الوصول إلى Pub/Sub يمرّ عبر Workload Identity — لا مفتاح حساب خدمة على
 * القرص ولا في متغيرات البيئة.
 */
export class GcpSender implements Sender {
  readonly name = 'gcp';

  private readonly topic: Topic | null;
  private readonly emailEnabled: boolean;

  constructor(
    projectId: string | undefined,
    private readonly fromAddress: string,
    apiKey: string | undefined,
    smsTopic: string | undefined,
  ) {
    if (apiKey) {
      sgMail.setApiKey(apiKey);
    }
    this.emailEnabled = Boolean(apiKey);

    // عميل Pub/Sub لا يتصل عند الإنشاء، لكن بناءه بلا طوبيك مُعرَّف يخفي
    // خطأ إعداد حتى أول رسالة نصية — لذلك نحسمه هنا.
    const pubsub = new PubSub(projectId ? { projectId } : {});
    this.topic = smsTopic ? pubsub.topic(smsTopic) : null;
  }

  async sendEmail(to: string, message: RenderedMessage): Promise<void> {
    if (!this.emailEnabled) {
      throw new Error('SENDGRID_API_KEY is not configured');
    }
    await sgMail.send({
      to,
      from: this.fromAddress,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  }

  async sendSms(phone: string, text: string): Promise<void> {
    if (!this.topic) {
      throw new Error('PUBSUB_SMS_TOPIC is not configured');
    }
    await this.topic.publishMessage({
      json: { phone, text },
      // البوّابة تُرشّح على السمة لا على المحتوى، فيبقى نصّ الرسالة معتمًا
      // في سجلات Pub/Sub وفي أي اشتراك تشخيصي.
      attributes: { channel: 'sms', service: 'notification-service' },
    });
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
