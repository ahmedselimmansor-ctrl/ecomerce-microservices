'use client';

import { useEffect, useState } from 'react';

/**
 * هل اكتملت الإماهة على العميل؟
 *
 * <p>مستقل عن zustand عمدًا. الاعتماد على `onRehydrateStorage` غير موثوق هنا:
 * الإماهة من `localStorage` تتم بشكل متزامن أثناء إنشاء المخزن — أي قبل إسناد
 * المتغيّر المصدَّر — فأي محاولة لضبط علم داخل ذلك الاستدعاء إما ترمي
 * ReferenceError تبتلعها المكتبة، أو تُطبَّق على كائن حالة لا يُعاد رسمه،
 * فيبقى العلم false وتعلق الصفحة على دوّارة تحميل أبدية.
 *
 * <p>بما أن القراءة من التخزين متزامنة، فإن أول تشغيل لـ `useEffect` بعد
 * التركيب هو بالضبط اللحظة التي تصبح فيها الحالة المستعادة متاحة.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
