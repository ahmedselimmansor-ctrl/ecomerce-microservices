import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { brandInitials, discountPercent, formatCount, formatMoney } from './format.js';

/**
 * دوال العرض.
 *
 * <p>هذه الطبقة هي المكان الوحيد الذي تُقسَم فيه المبالغ على 100. أي خطأ هنا
 * يظهر للعميل مباشرةً على بطاقة المنتج وفي صفحة الدفع، ولا يمسكه اختبار
 * تكامل لأنه لا يمرّ بالخادم.
 */

describe('formatMoney', () => {
  it('يقسم على 100 عند العرض فقط', () => {
    assert.match(formatMoney(125050, 'EGP', 'en-EG', false), /1,250\.5/);
  });

  it('الصفر يُعرض صفرًا لا فارغًا', () => {
    assert.match(formatMoney(0, 'EGP', 'en-EG', false), /^0$/);
  });

  it('يحذف الكسر الصفري: 1250.00 ⇒ 1,250', () => {
    assert.match(formatMoney(125000, 'EGP', 'en-EG', false), /^1,250$/);
  });

  it('يبقي القرش عند وجوده', () => {
    assert.match(formatMoney(99, 'EGP', 'en-EG', false), /0\.99/);
  });

  it('يُدرج رمز العملة عند الطلب', () => {
    const out = formatMoney(125050, 'EGP', 'en-EG', true);
    assert.ok(/EGP|E£|£/.test(out), `توقّعت رمز عملة في: ${out}`);
  });

  /**
   * المُنسِّقات مُخزَّنة في Map بمفتاح مركّب. لو أهمل المفتاح أحد أبعاده لعاد
   * مُنسِّق عملة لطلب بلا عملة — والرمز يظهر حيث لا يجب.
   */
  it('الكاش لا يخلط بين النسخة بعملة والنسخة بدونها', () => {
    const withCur = formatMoney(125050, 'EGP', 'en-EG', true);
    const without = formatMoney(125050, 'EGP', 'en-EG', false);
    assert.notEqual(withCur, without);
    assert.equal(formatMoney(125050, 'EGP', 'en-EG', false), without);
  });

  it('المبالغ الكبيرة تُفصَل بفواصل', () => {
    assert.match(formatMoney(999999900, 'EGP', 'en-EG', false), /9,999,999/);
  });
});

describe('formatCount', () => {
  it('أقل من ألف يُعرض كما هو', () => {
    assert.equal(formatCount(0), '0');
    assert.equal(formatCount(999), '999');
  });

  it('الآلاف تُختصر بـ K', () => {
    assert.equal(formatCount(1000), '1.0K');
    assert.equal(formatCount(29500), '29.5K');
  });

  it('الملايين تُختصر بـ M', () => {
    assert.equal(formatCount(1_000_000), '1.0M');
    assert.equal(formatCount(2_400_000), '2.4M');
  });

  it('الحدود الفاصلة', () => {
    assert.equal(formatCount(999_999), '1000.0K');
    assert.equal(formatCount(1_000_000), '1.0M');
  });
});

/**
 * نفس المنطق منفَّذ في {@code Product.Price.discountPercent} بلغة Java.
 * الحالات هنا مطابقة لحالات ProductPriceTest عمدًا: بطاقة تقول 25% ونتيجة
 * بحث تقول 24% لنفس المنتج تبدو خللًا في المتجر لا اختلافًا في التقريب.
 */
describe('discountPercent — تطابق مع نسخة Java', () => {
  const cases: Array<[number, number | null | undefined, number | null]> = [
    [7500, 10000, 25],
    [5000, 10000, 50],
    [9000, 10000, 10],
    [449900, 529900, 15],
    [1, 100, 99],
    [6667, 10000, 33],
    [6666, 10000, 33],
    [9950, 10000, 1],
    [9949, 10000, 1],
    [5_000_000_000, 10_000_000_000, 50],
    [10000, null, null],
    [10000, undefined, null],
    [10000, 8000, null],   // السعر ارتفع — ليس خصمًا
    [10000, 10000, null],  // لا تغيير
    [10000, 0, null],      // لا قسمة على صفر
  ];

  for (const [price, was, expected] of cases) {
    it(`${price} بعد ${was} ⇒ ${expected}`, () => {
      assert.equal(discountPercent(price, was), expected);
    });
  }
});

describe('brandInitials', () => {
  it('يأخذ أول حرفين من كلمتين', () => {
    assert.equal(brandInitials('Ray Ban'), 'RB');
  });

  it('كلمة واحدة تعطي حرفًا واحدًا على الأقل', () => {
    assert.ok(brandInitials('Apple').length >= 1);
  });

  it('لا ينهار على نص فارغ', () => {
    assert.doesNotThrow(() => brandInitials(''));
  });

  it('يعمل مع العربية', () => {
    assert.ok(brandInitials('سامسونج مصر').length >= 1);
  });
});
