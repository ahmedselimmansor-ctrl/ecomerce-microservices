import Fastify from 'fastify';
import { Kafka, logLevel, type Consumer, type EachMessagePayload } from 'kafkajs';
import { z } from 'zod';
import { templates } from './templates.js';
import { GcpSender, LocalSender, type Sender } from './senders.js';

const PORT = Number(process.env.PORT ?? 8089);
const HOST = process.env.HOST ?? '0.0.0.0';
const BROKERS = (process.env.KAFKA_BOOTSTRAP_SERVERS ?? 'localhost:9092').split(',');
const GROUP_ID = process.env.KAFKA_GROUP_ID ?? 'notification-service';
/**
 * نستهلك طوبيك الأوامر الصريحة فقط افتراضيًا.
 *
 * <p>إضافة `order.events.v1` هنا تبدو مفيدة (تغطية تلقائية لأحداث النطاق)
 * لكنها تنتج إشعارًا مزدوجًا: order-service ينشر `order.confirmed` على طوبيك
 * الطلبات <b>و</b> `notification.order_confirmed` على طوبيك الأوامر، فيصل
 * إيميلان لنفس الطلب. إزالة التكرار بـ eventId لا تساعد — الحدثان مختلفان
 * فعلًا.
 *
 * <p>القاعدة: <b>الأمر الصريح هو المصدر الوحيد للإشعار</b>. الخدمة التي
 * تريد إرسال إشعار تنشر أمرًا، ولا تعتمد على استنتاجه من حدث نطاق.
 * دالة {@link templateForDomainEvent} تبقى لخدمات تنشر أحداث نطاق فقط
 * (مثل `user.registered`) وتُفعَّل بإضافة طوبيكها إلى KAFKA_TOPICS.
 */
const TOPICS = (process.env.KAFKA_TOPICS ?? 'notification.commands.v1').split(',');
const IDENTITY_URL = process.env.SERVICE_URL_IDENTITY ?? 'http://localhost:8081';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

// ------------------------------------------------------------------- sender

const sender: Sender = process.env.SMTP_HOST
  ? new LocalSender(
      process.env.SMTP_HOST,
      Number(process.env.SMTP_PORT ?? 1025),
      process.env.MAIL_FROM ?? 'noreply@topchoice.local',
    )
  : new GcpSender(
      process.env.GCP_PROJECT_ID,
      process.env.MAIL_FROM ?? 'noreply@topchoice.example',
      process.env.SENDGRID_API_KEY,
      process.env.PUBSUB_SMS_TOPIC,
    );

app.log.info(`notification sender: ${sender.name}`);

// -------------------------------------------------------------------- kafka

const kafka = new Kafka({
  clientId: 'notification-service',
  brokers: BROKERS,
  logLevel: logLevel.WARN,
  retry: { initialRetryTime: 300, retries: 8 },
});

const consumer: Consumer = kafka.consumer({
  groupId: GROUP_ID,
  sessionTimeout: 30_000,
  heartbeatInterval: 3_000,
});
const producer = kafka.producer();

const envelopeSchema = z.object({
  eventId: z.string(),
  eventType: z.string(),
  traceId: z.string().optional().nullable(),
  aggregateId: z.string().optional().nullable(),
  payload: z.record(z.unknown()).default({}),
});

/** حماية من إعادة المعالجة داخل نفس النسخة (Kafka تسلّم at-least-once). */
const seenEvents = new Set<string>();
const SEEN_LIMIT = 50_000;

const state = { ready: false, processed: 0, failed: 0, skipped: 0 };

async function handleMessage({ topic, partition, message }: EachMessagePayload): Promise<void> {
  const raw = message.value?.toString();
  if (!raw) return;

  let event: z.infer<typeof envelopeSchema>;
  try {
    event = envelopeSchema.parse(JSON.parse(raw));
  } catch (err) {
    // رسالة تالفة: إعادة المحاولة لن تصلحها — إلى الـ DLQ مباشرة
    app.log.error({ err, topic, partition }, 'malformed event — routing to DLQ');
    await toDlq(topic, raw, 'MALFORMED');
    return;
  }

  if (seenEvents.has(event.eventId)) {
    state.skipped += 1;
    return;
  }

  try {
    await dispatch(event);
    markSeen(event.eventId);
    state.processed += 1;
  } catch (err) {
    state.failed += 1;
    app.log.error({ err, eventId: event.eventId, type: event.eventType }, 'delivery failed');
    // فشل الإرسال لا يُعيد تشغيل الـ partition كلها — الإشعار ليس حرجًا كالطلب
    await toDlq(topic, raw, 'DELIVERY_FAILED');
    markSeen(event.eventId);
  }
}

async function dispatch(event: z.infer<typeof envelopeSchema>): Promise<void> {
  const payload = event.payload as Record<string, unknown>;

  // نوعان من الأحداث: أوامر إشعار صريحة، وأحداث نطاق نستنتج منها القالب
  const template =
    (payload['template'] as string | undefined) ?? templateForDomainEvent(event.eventType);

  if (!template || !templates[template]) {
    return; // حدث لا يستدعي إشعارًا
  }

  const userId = payload['userId'] as string | undefined;
  if (!userId) {
    app.log.warn({ eventId: event.eventId }, 'notification event without userId — skipping');
    return;
  }

  const recipient = await lookupRecipient(userId);
  if (!recipient?.email) {
    app.log.warn({ userId }, 'no email on file — skipping');
    return;
  }

  const data = (payload['data'] as Record<string, unknown> | undefined) ?? payload;
  const rendered = templates[template]!(data);

  await sender.sendEmail(recipient.email, rendered);
  app.log.info({ userId, template, eventId: event.eventId }, 'notification sent');
}

function templateForDomainEvent(eventType: string): string | null {
  switch (eventType) {
    case 'order.confirmed': return 'order_confirmed';
    case 'order.cancelled': return 'order_cancelled';
    case 'order.shipped': return 'order_shipped';
    case 'user.registered': return 'welcome';
    default: return null;
  }
}

interface Recipient { email: string; fullName?: string; locale?: string }

const recipientCache = new Map<string, { value: Recipient | null; expiresAt: number }>();

/** بيانات المستخدم تتغير نادرًا ⇒ كاش قصير يقلّل الحمل على identity-service. */
async function lookupRecipient(userId: string): Promise<Recipient | null> {
  const cached = recipientCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  try {
    const res = await fetch(`${IDENTITY_URL}/api/v1/internal/users/${userId}`, {
      headers: { 'x-internal-caller': 'notification-service' },
      signal: AbortSignal.timeout(2_000),
    });
    const value = res.ok ? ((await res.json()) as Recipient) : null;
    recipientCache.set(userId, { value, expiresAt: Date.now() + 300_000 });
    return value;
  } catch (err) {
    app.log.warn({ err, userId }, 'recipient lookup failed');
    return null;
  }
}

async function toDlq(topic: string, raw: string, reason: string): Promise<void> {
  try {
    await producer.send({
      topic: `${topic}.dlq`,
      messages: [{ value: raw, headers: { reason, service: 'notification-service' } }],
    });
  } catch (err) {
    app.log.error({ err }, 'failed writing to DLQ');
  }
}

function markSeen(eventId: string): void {
  seenEvents.add(eventId);
  if (seenEvents.size > SEEN_LIMIT) {
    // تقليم بسيط: نمسح النصف الأقدم إدراجًا (Set يحفظ ترتيب الإدراج)
    const toDrop = Math.floor(SEEN_LIMIT / 2);
    let i = 0;
    for (const id of seenEvents) {
      seenEvents.delete(id);
      if (++i >= toDrop) break;
    }
  }
}

// ------------------------------------------------------------------- health

app.get('/health/live', async () => ({ status: 'UP' }));

app.get('/health/ready', async (_req, reply) =>
  state.ready ? { status: 'UP', ...state } : reply.code(503).send({ status: 'DOWN' }));

app.get('/metrics', async () => state);

// --------------------------------------------------------------------- boot

async function start(): Promise<void> {
  await producer.connect();
  await consumer.connect();
  for (const topic of TOPICS) {
    await consumer.subscribe({ topic: topic.trim(), fromBeginning: false });
  }

  await consumer.run({
    eachMessage: handleMessage,
    autoCommit: true,
    autoCommitInterval: 5_000,
  });

  state.ready = true;
  await app.listen({ port: PORT, host: HOST });
  app.log.info(`notification-service consuming ${TOPICS.join(', ')}`);
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, async () => {
    app.log.info(`${signal} received — leaving consumer group`);
    state.ready = false;
    // الانسحاب من المجموعة قبل الإغلاق يمنع إعادة توازن طويلة
    await consumer.disconnect().catch(() => undefined);
    await producer.disconnect().catch(() => undefined);
    await app.close().catch(() => undefined);
    process.exit(0);
  });
}

start().catch((err) => {
  app.log.error({ err }, 'failed to start');
  process.exit(1);
});
