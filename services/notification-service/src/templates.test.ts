import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { templates } from './templates.js';

/**
 * قوالب البريد.
 *
 * <p>محتوى الرسالة يأتي من بيانات الطلب، وبعضها يكتبه المستخدم نفسه (الاسم،
 * العنوان). أي حرف يمرّ بلا هروب يصبح HTML داخل بريد العميل — والقالب لا
 * يمرّ بأي طبقة تنظيف أخرى قبل الإرسال، فهذه الاختبارات هي الحارس الوحيد.
 */

const ORDER = {
  orderNumber: 'TC-100042',
  fullName: 'أحمد',
  totalMinor: 125050,
  currency: 'EGP',
  items: [{ title: 'آيفون ١٥', quantity: 1, unitPriceMinor: 125050 }],
};

/**
 * `templates` من نوع Record، فكل مفتاح احتماله undefined لدى المُدقِّق.
 * نفشل هنا برسالة تقول أي قالب اختفى بدل «cannot invoke undefined» غامضة.
 */
function render(name: string, data: Record<string, unknown>) {
  const template = templates[name];
  assert.ok(template, `القالب مفقود: ${name}`);
  return template(data);
}

describe('كل القوالب', () => {
  for (const [name, render] of Object.entries(templates)) {
    describe(name, () => {
      it('يُنتج موضوعًا ونصًّا و HTML غير فارغة', () => {
        const out = render(ORDER);
        assert.ok(out.subject.length > 0, 'الموضوع فارغ');
        assert.ok(out.html.length > 0, 'HTML فارغ');
        assert.ok(out.text.length > 0, 'النص فارغ');
      });

      it('يحمل هوية TopChoice', () => {
        const out = render(ORDER);
        assert.match(out.html, /TopChoice|Top<\/span>/);
      });

      /**
       * نسخة نصية إلزامية: بعض عملاء البريد يحجبون HTML كليًا، وبريد بلا
       * بديل نصي يصل فارغًا — أو يُصنَّف كرسالة مزعجة.
       */
      it('النسخة النصية ليست HTML', () => {
        const out = render(ORDER);
        assert.doesNotMatch(out.text, /<html|<body|<table/i);
      });

      it('لا ينهار على بيانات ناقصة', () => {
        assert.doesNotThrow(() => render({}));
      });

      it('لا يطبع undefined أو null للمستخدم', () => {
        const out = render({});
        assert.doesNotMatch(out.html, /undefined|null/);
        assert.doesNotMatch(out.subject, /undefined|null/);
      });
    });
  }
});

describe('الهروب من HTML', () => {
  const XSS = '<script>alert(1)</script>';

  // كل قالب والحقل الذي يحمل مدخلًا يتحكم فيه المستخدم أو نظام خارجي
  const CASES: Array<[string, string]> = [
    ['welcome', 'fullName'],            // يكتبه المستخدم عند التسجيل
    ['order_confirmed', 'orderNumber'],
    ['order_cancelled', 'orderNumber'],
    ['order_shipped', 'trackingNumber'], // يأتي من شركة الشحن
  ];

  for (const [template, field] of CASES) {
    it(`${template}: الوسوم في ${field} تُهرَّب`, () => {
      const out = render(template, { ...ORDER, [field]: XSS });

      assert.doesNotMatch(out.html, /<script>/);
      assert.match(out.html, /&lt;script&gt;/);
    });

    it(`${template}: علامات التنصيص في ${field} لا تكسر السمات`, () => {
      const out = render(template, { ...ORDER, [field]: '" onmouseover="alert(1)' });

      assert.doesNotMatch(out.html, /onmouseover="alert/);
      assert.match(out.html, /&quot;/);
    });
  }

  it('الأمبرساند يُهرَّب مرة واحدة فلا يتضاعف الترميز', () => {
    const out = render('welcome', { fullName: 'A & B' });

    assert.match(out.html, /A &amp; B/);
    assert.doesNotMatch(out.html, /&amp;amp;/);
  });
});

describe('عرض المبالغ', () => {
  it('يقسم على 100 ويعرض منزلتين', () => {
    const out = render('order_confirmed', ORDER);
    assert.match(out.text + out.html, /1250\.50/);
  });

  it('العملة الافتراضية جنيه مصري لا درهم', () => {
    const out = render('order_confirmed', { ...ORDER, currency: undefined });
    assert.match(out.text + out.html, /EGP/);
    assert.doesNotMatch(out.text + out.html, /AED/);
  });

  it('المبلغ الصفري يُعرض 0.00 لا فارغًا', () => {
    const out = render('order_confirmed', { ...ORDER, totalMinor: 0 });
    assert.match(out.text + out.html, /0\.00/);
  });
});
