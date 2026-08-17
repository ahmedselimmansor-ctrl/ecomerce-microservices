export interface RenderedMessage {
  subject: string;
  html: string;
  text: string;
}

type TemplateData = Record<string, unknown>;

const money = (minor: unknown, currency: unknown): string => {
  const amount = typeof minor === 'number' ? minor : Number(minor ?? 0);
  return `${(amount / 100).toFixed(2)} ${String(currency ?? 'AED')}`;
};

const escape = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const layout = (title: string, body: string): string => `<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><title>${escape(title)}</title></head>
<body style="margin:0;padding:24px;background:#f4f4f6;font-family:system-ui,-apple-system,'Segoe UI',sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:12px;overflow:hidden">
        <tr><td style="background:#feee00;padding:20px;text-align:center">
          <span style="font-size:24px;font-weight:800;color:#404553">topchoice</span>
        </td></tr>
        <tr><td style="padding:28px;color:#404553;line-height:1.7;font-size:15px">${body}</td></tr>
        <tr><td style="padding:16px;background:#fafafa;text-align:center;color:#9ba0b1;font-size:12px">
          هذه رسالة آلية — الرجاء عدم الرد عليها.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

/**
 * قوالب الرسائل.
 *
 * <p>محليًا نرسم HTML هنا. في الإنتاج على AWS تُستبدل بـ
 * <b>SES Templates</b> فيمكن لفريق التسويق تعديل النصوص دون نشر كود.
 */
export const templates: Record<string, (data: TemplateData) => RenderedMessage> = {
  order_confirmed: (data) => {
    const orderNumber = escape(data['orderNumber']);
    const total = money(data['totalMinor'], data['currency']);
    return {
      subject: `تم تأكيد طلبك ${orderNumber}`,
      html: layout('تأكيد الطلب', `
        <h2 style="margin:0 0 12px">شكرًا لطلبك!</h2>
        <p>تم تأكيد طلبك رقم <strong>${orderNumber}</strong> بنجاح.</p>
        <p>الإجمالي: <strong>${escape(total)}</strong></p>
        <p>سنُعلمك فور شحن الطلب.</p>`),
      text: `تم تأكيد طلبك ${orderNumber}. الإجمالي: ${total}`,
    };
  },

  order_cancelled: (data) => {
    const orderNumber = escape(data['orderNumber']);
    const reason = reasonInArabic(String(data['reason'] ?? ''));
    return {
      subject: `تم إلغاء طلبك ${orderNumber}`,
      html: layout('إلغاء الطلب', `
        <h2 style="margin:0 0 12px">تم إلغاء الطلب</h2>
        <p>طلبك رقم <strong>${orderNumber}</strong> أُلغي.</p>
        <p>السبب: ${escape(reason)}</p>
        <p>إن كان قد تم خصم أي مبلغ فسيُعاد خلال 5–7 أيام عمل.</p>`),
      text: `تم إلغاء طلبك ${orderNumber}. السبب: ${reason}`,
    };
  },

  order_shipped: (data) => {
    const orderNumber = escape(data['orderNumber']);
    const tracking = escape(data['trackingNumber'] ?? '—');
    return {
      subject: `طلبك ${orderNumber} في الطريق`,
      html: layout('شحن الطلب', `
        <h2 style="margin:0 0 12px">طلبك في الطريق إليك</h2>
        <p>رقم الطلب: <strong>${orderNumber}</strong></p>
        <p>رقم التتبّع: <strong>${tracking}</strong></p>`),
      text: `طلبك ${orderNumber} تم شحنه. رقم التتبّع: ${tracking}`,
    };
  },

  welcome: (data) => {
    const name = escape(data['fullName'] ?? 'عميلنا العزيز');
    return {
      subject: 'أهلًا بك في topchoice',
      html: layout('مرحبًا', `
        <h2 style="margin:0 0 12px">أهلًا ${name}!</h2>
        <p>حسابك جاهز الآن. استمتع بتجربة تسوّق سريعة وآمنة.</p>`),
      text: `أهلًا ${name}! حسابك في topchoice جاهز.`,
    };
  },
};

function reasonInArabic(code: string): string {
  const map: Record<string, string> = {
    OUT_OF_STOCK: 'نفاد الكمية',
    SKU_NOT_FOUND: 'أحد المنتجات لم يعد متاحًا',
    PAYMENT_FAILED: 'تعذّر إتمام الدفع',
    CARD_DECLINED: 'رفض البنك عملية الدفع',
    INSUFFICIENT_FUNDS: 'الرصيد غير كافٍ',
    GATEWAY_ERROR: 'خطأ مؤقت في بوابة الدفع',
    CANCELLED_BY_USER: 'بناءً على طلبك',
  };
  return map[code] ?? code;
}
