import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MAX_DISTINCT_ITEMS,
  MAX_QUANTITY_PER_ITEM,
  canAcceptNewItem,
  isValidQuantity,
  mergedQuantity,
  nextQuantityOnAdd,
} from './cart-rules.js';

describe('nextQuantityOnAdd', () => {
  it('الإضافة تُراكم لا تستبدل', () => {
    assert.equal(nextQuantityOnAdd(2, 3), 5);
  });

  it('الصنف الجديد يبدأ من الكمية المضافة', () => {
    assert.equal(nextQuantityOnAdd(0, 1), 1);
  });

  it('تتوقف عند السقف بدل أن ترفض', () => {
    assert.equal(nextQuantityOnAdd(19, 50), MAX_QUANTITY_PER_ITEM);
  });

  it('السقف لا يُتجاوز بالتراكم المتكرر', () => {
    let q = 0;
    for (let i = 0; i < 100; i++) q = nextQuantityOnAdd(q, 1);
    assert.equal(q, MAX_QUANTITY_PER_ITEM);
  });
});

describe('mergedQuantity', () => {
  /**
   * جوهر الدمج: الأكبر لا المجموع. عميل أضاف نفس المنتج على هاتفه وحاسوبه
   * يجب ألّا يجد ضعف ما أراد عند تسجيل الدخول.
   */
  it('يأخذ الأكبر لا المجموع', () => {
    assert.equal(mergedQuantity(2, 3), 3);
    assert.equal(mergedQuantity(5, 1), 5);
  });

  it('سلة مستخدم فارغة تعني كمية الزائر', () => {
    assert.equal(mergedQuantity(4, 0), 4);
  });

  it('سلة زائر فارغة تُبقي كمية المستخدم', () => {
    assert.equal(mergedQuantity(0, 7), 7);
  });

  it('تساوي الكميتين لا يضاعف', () => {
    assert.equal(mergedQuantity(3, 3), 3);
  });

  it('السقف يُطبَّق بعد الدمج', () => {
    assert.equal(mergedQuantity(20, 20), MAX_QUANTITY_PER_ITEM);
    assert.equal(mergedQuantity(19, 20), MAX_QUANTITY_PER_ITEM);
  });
});

describe('canAcceptNewItem', () => {
  it('السلة الفارغة تقبل', () => {
    assert.equal(canAcceptNewItem(0), true);
  });

  it('تقبل حتى ما قبل السقف', () => {
    assert.equal(canAcceptNewItem(MAX_DISTINCT_ITEMS - 1), true);
  });

  it('ترفض عند السقف', () => {
    assert.equal(canAcceptNewItem(MAX_DISTINCT_ITEMS), false);
  });
});

describe('isValidQuantity', () => {
  it('يقبل الصفر — حذف لا خطأ', () => {
    assert.equal(isValidQuantity(0), true);
  });

  it('يقبل المدى المسموح', () => {
    assert.equal(isValidQuantity(1), true);
    assert.equal(isValidQuantity(MAX_QUANTITY_PER_ITEM), true);
  });

  it('يرفض ما فوق السقف', () => {
    assert.equal(isValidQuantity(MAX_QUANTITY_PER_ITEM + 1), false);
  });

  it('يرفض السالب', () => {
    assert.equal(isValidQuantity(-1), false);
  });

  it('يرفض الكسر', () => {
    assert.equal(isValidQuantity(1.5), false);
  });

  it('يرفض ما ليس رقمًا', () => {
    for (const bad of ['3', null, undefined, {}, [], NaN, Infinity]) {
      assert.equal(isValidQuantity(bad), false, `قُبل خطأً: ${String(bad)}`);
    }
  });
});
