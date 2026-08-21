import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isBlockedPath } from './path-guard.js';

/**
 * حجب المسارات الداخلية عند الحافة.
 *
 * <p>هذه الاختبارات مكتوبة بعد ثغرة حقيقية: كان الحجب يطابق على الـ URL الخام،
 * فمرّ {@code /api/v1/products/%61dmin} و{@code /api/v1/products/admin;x=1}
 * إلى catalog-service الذي فكّهما إلى {@code /admin} — فأتاح سرد المنتجات
 * المؤرشفة وحذفها بلا أي مصادقة (DELETE أعاد 204).
 *
 * <p>الدرس المعمّم: أي قائمة حظر تُطابَق على مدخل لم يُطبَّع هي قائمة حظر
 * يملك المهاجم مفاتيحها. لذلك كل حالة أدناه شكل ترميز مختلف لنفس الكلمة.
 */
describe('isBlockedPath', () => {
  describe('المسارات المشروعة تمرّ', () => {
    const allowed = [
      '/api/v1/products',
      '/api/v1/products/TC-APL-IP15-128-BLK',
      '/api/v1/products/slug/apple-iphone-15',
      '/api/v1/categories?depth=2',
      '/api/v1/search?q=admin',           // «admin» كنص بحث لا كمقطع مسار
      '/api/v1/products?brand=administrator',
      '/api/v1/products/administrator',   // مقطع يبدأ بـ admin لكنه ليس admin
      '/api/v1/products/my-admin-panel',
      '/api/v1/cart',
      '/health/live',
    ];
    for (const url of allowed) {
      it(url, () => assert.equal(isBlockedPath(url), false));
    }
  });

  describe('الحجب المباشر', () => {
    const blocked = [
      '/api/v1/products/admin',
      '/api/v1/products/admin/',
      '/api/v1/products/admin/stats',
      '/api/v1/products/admin?page=0',
      '/api/v1/orders/internal',
      '/api/v1/orders/internal/replay',
      '/actuator/health',
      '/api/v1/products/actuator/env',
    ];
    for (const url of blocked) {
      it(url, () => assert.equal(isBlockedPath(url), true));
    }
  });

  describe('حالة الأحرف', () => {
    for (const url of [
      '/api/v1/products/ADMIN',
      '/api/v1/products/AdMiN/stats',
      '/api/v1/orders/INTERNAL',
    ]) {
      it(url, () => assert.equal(isBlockedPath(url), true));
    }
  });

  describe('الترميز المئوي — الثغرة الأصلية', () => {
    const blocked = [
      '/api/v1/products/%61dmin',          // a
      '/api/v1/products/adm%69n',          // i
      '/api/v1/products/%61%64%6d%69%6e',  // admin كاملة
      '/api/v1/products/%2561dmin',        // ترميز مزدوج
      '/api/v1/products/%41DMIN',          // A كبيرة
      '/api/v1/orders/%69nternal',
    ];
    for (const url of blocked) {
      it(url, () => assert.equal(isBlockedPath(url), true));
    }
  });

  describe('معاملات المصفوفة — الثغرة الثانية', () => {
    const blocked = [
      '/api/v1/products/admin;x=1',
      '/api/v1/products/admin;jsessionid=ABC123',
      '/api/v1/products/admin;a=1;b=2/stats',
      '/api/v1/products/%61dmin;x=1',      // الاثنتان معًا
    ];
    for (const url of blocked) {
      it(url, () => assert.equal(isBlockedPath(url), true));
    }
  });

  describe('تطبيع المسار', () => {
    const blocked = [
      '/api/v1//admin',
      '/api/v1/products/./admin',
      '/api/v1/products/foo/../admin',
      '/api/v1/products/foo/bar/../../admin',
      '/api/v1///products///admin///',
    ];
    for (const url of blocked) {
      it(url, () => assert.equal(isBlockedPath(url), true));
    }
  });

  describe('المدخل المشبوه يُرفض بذاته', () => {
    /**
     * الشرطة المرمّزة والترميز التالف لا معنى مشروعًا لهما في مسار عام.
     * نرفضهما بدل محاولة تخمين ما قصده المرسل — التخمين هو ما يفتح الثغرات.
     */
    for (const url of [
      '/api/v1/products%2Fadmin',
      '/api/v1/products/admin%2Fstats',
      '/api/v1/products/%2e%2e%2fadmin',
      '/api/v1/products/%zz',
    ]) {
      it(url, () => assert.equal(isBlockedPath(url), true));
    }
  });
});
