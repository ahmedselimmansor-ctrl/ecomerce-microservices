import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isUrgent,
  selectSignal,
  SIGNAL_LABEL,
  type ProductSignal,
} from './product-signal.js';

/**
 * اختيار إشارة بطاقة المنتج.
 *
 * <p>القاعدة التي تحرسها هذه الاختبارات: إشارة واحدة فقط، بترتيب أولوية
 * ثابت. الخطأ هنا لا يكسر شيئًا تقنيًا — البطاقة تُعرض والصفحة تعمل — لكنه
 * يُفقد الشبكة معناها: بطاقة تقول «الكمية تنفد» بجوار أخرى تقول الشيء نفسه
 * لأن الوسم شائع، أو منتج نادر يعرض «توصيل مجاني» لأن الترتيب انقلب.
 */

describe('selectSignal — الأولوية', () => {
  it('الندرة تسبق كل شيء', () => {
    assert.equal(
      selectSignal(['low-stock', 'lowest-price', 'bestseller', 'trending']),
      'low-stock',
    );
  });

  it('أقل سعر يسبق الشعبية', () => {
    assert.equal(selectSignal(['lowest-price', 'bestseller', 'trending']), 'lowest-price');
  });

  it('الأعلى تقييمًا يسبق الرائج', () => {
    assert.equal(selectSignal(['bestseller', 'trending']), 'bestseller');
  });

  it('الرائج يسبق الافتراضي', () => {
    assert.equal(selectSignal(['trending']), 'trending');
  });

  /** ترتيب الوسوم في المصفوفة لا يؤثر — الأولوية من الجدول لا من الإدخال. */
  it('ترتيب الوسوم في المدخل لا يغيّر النتيجة', () => {
    assert.equal(selectSignal(['trending', 'low-stock']), 'low-stock');
    assert.equal(selectSignal(['low-stock', 'trending']), 'low-stock');
    assert.equal(selectSignal(['bestseller', 'lowest-price']), 'lowest-price');
  });
});

describe('selectSignal — الافتراضي', () => {
  it('بلا وسوم مطابقة ⇒ توصيل مجاني', () => {
    assert.equal(selectSignal([]), 'free-delivery');
    assert.equal(selectSignal(['express', 'market', 'new']), 'free-delivery');
  });

  it('لا ينهار على null أو undefined', () => {
    assert.equal(selectSignal(null), 'free-delivery');
    assert.equal(selectSignal(undefined), 'free-delivery');
  });

  /** وسم غير معروف يُتجاهَل ولا يمنع الافتراضي. */
  it('الوسوم غير المعروفة تُتجاهَل', () => {
    assert.equal(selectSignal(['some-future-tag']), 'free-delivery');
    assert.equal(selectSignal(['some-future-tag', 'bestseller']), 'bestseller');
  });
});

describe('isUrgent', () => {
  /**
   * الإلحاح وحده يُلوَّن بالرمّاني. لو صارت كل الإشارات إلحاحًا لصارت الشبكة
   * حمراء بالكامل — واللون الذي يعني «انتبه» في كل مكان لا يعني شيئًا.
   */
  it('الندرة وأقل سعر إلحاح', () => {
    assert.equal(isUrgent('low-stock'), true);
    assert.equal(isUrgent('lowest-price'), true);
  });

  it('البقية ليست إلحاحًا', () => {
    assert.equal(isUrgent('bestseller'), false);
    assert.equal(isUrgent('trending'), false);
    assert.equal(isUrgent('free-delivery'), false);
  });

  it('الإلحاح أقلية — وإلا فقد اللون معناه', () => {
    const all: ProductSignal[] = [
      'low-stock', 'lowest-price', 'bestseller', 'trending', 'free-delivery',
    ];
    const urgent = all.filter(isUrgent).length;
    assert.ok(urgent < all.length / 2, `${urgent} من ${all.length} إشارات إلحاح`);
  });
});

describe('SIGNAL_LABEL', () => {
  const all: ProductSignal[] = [
    'low-stock', 'lowest-price', 'bestseller', 'trending', 'free-delivery',
  ];

  it('لكل إشارة نص', () => {
    for (const signal of all) {
      assert.ok(SIGNAL_LABEL[signal]?.length > 0, `نص مفقود: ${signal}`);
    }
  });

  it('النصوص متمايزة — نصّان متطابقان يعنيان إشارة بلا فائدة', () => {
    const labels = all.map((s) => SIGNAL_LABEL[s]);
    assert.equal(new Set(labels).size, labels.length);
  });
});
