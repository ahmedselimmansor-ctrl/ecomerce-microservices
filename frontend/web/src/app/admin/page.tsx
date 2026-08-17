'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Package, ShoppingBag, Boxes, TrendingUp, AlertTriangle, Loader2,
  CheckCircle2, Truck, XCircle, Clock,
} from 'lucide-react';
import { adminApi, type Dashboard } from '@/lib/admin-api';
import { formatMoney, formatNumber } from '@/lib/format';

export default function AdminDashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await adminApi.dashboard();
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'تعذّر تحميل المؤشرات');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="rounded-lg border border-tc-line bg-white p-8 text-center">
        <AlertTriangle className="mx-auto size-10 text-tc-berry" aria-hidden />
        <p className="mt-3 font-bold">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="grid h-64 place-items-center">
        <Loader2 className="size-8 animate-spin text-tc-muted" aria-hidden />
      </div>
    );
  }

  const { catalog, orders, inventory } = data;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold sm:text-2xl">لوحة المؤشرات</h1>

      {/* الخدمات مستقلة: سقوط إحداها يُفرّغ بطاقاتها فقط لا اللوحة كلها */}
      {(!catalog || !orders || !inventory) && (
        <p className="flex items-center gap-2 rounded-lg bg-tc-accent/40 px-4 py-3 text-sm">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          بعض الخدمات لم تستجب — الأرقام المعروضة جزئية.
        </p>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={TrendingUp}
          label="إجمالي الإيراد"
          value={orders ? formatMoney(orders.revenueMinor) : '—'}
          hint={orders ? `اليوم: ${formatMoney(orders.todayRevenueMinor)}` : undefined}
          tone="green"
        />
        <StatCard
          icon={ShoppingBag}
          label="الطلبات"
          value={orders ? formatNumber(orders.totalOrders) : '—'}
          hint={orders ? `اليوم: ${orders.todayOrders}` : undefined}
          href="/admin/orders"
        />
        <StatCard
          icon={Package}
          label="المنتجات النشطة"
          value={catalog ? formatNumber(catalog.active) : '—'}
          hint={catalog ? `الإجمالي: ${catalog.total}` : undefined}
          href="/admin/products"
        />
        <StatCard
          icon={Boxes}
          label="مخزون منخفض"
          value={inventory ? formatNumber(inventory.lowStock) : '—'}
          hint={inventory ? `نفد: ${inventory.outOfStock}` : undefined}
          tone={inventory && inventory.lowStock > 0 ? 'red' : undefined}
          href="/admin/inventory?low=true"
        />
      </section>

      {orders && (
        <section className="rounded-lg border border-tc-line bg-white p-4">
          <h2 className="mb-3 text-base font-extrabold">الطلبات حسب الحالة</h2>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatusTile icon={Clock} label="قيد المعالجة" value={orders.pending} tone="text-tc-amber" href="/admin/orders?status=PENDING" />
            <StatusTile icon={CheckCircle2} label="مؤكَّد" value={orders.confirmed} tone="text-tc-leaf" href="/admin/orders?status=CONFIRMED" />
            <StatusTile icon={Package} label="قيد التجهيز" value={orders.processing} tone="text-tc-link" href="/admin/orders?status=PROCESSING" />
            <StatusTile icon={Truck} label="تم الشحن" value={orders.shipped} tone="text-tc-link" href="/admin/orders?status=SHIPPED" />
            <StatusTile icon={CheckCircle2} label="تم التسليم" value={orders.delivered} tone="text-tc-leaf" href="/admin/orders?status=DELIVERED" />
            <StatusTile icon={XCircle} label="ملغي" value={orders.cancelled} tone="text-tc-berry" href="/admin/orders?status=CANCELLED" />
          </div>

          <p className="mt-4 border-t border-tc-line pt-3 text-sm text-tc-muted">
            متوسط قيمة الطلب:{' '}
            <strong className="text-tc-ink tabular">
              {formatMoney(Math.round(orders.averageOrderMinor))}
            </strong>
          </p>
        </section>
      )}

      <section className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-tc-line bg-white p-4">
          <h2 className="mb-3 text-base font-extrabold">الكتالوج</h2>
          {catalog ? (
            <dl className="space-y-2 text-sm">
              <Row label="نشط" value={formatNumber(catalog.active)} />
              <Row label="غير نشط" value={formatNumber(catalog.inactive)} />
              <Row label="مؤرشف" value={formatNumber(catalog.archived)} />
              <Row label="عدد العلامات" value={formatNumber(catalog.brands)} />
            </dl>
          ) : (
            <p className="text-sm text-tc-muted">الخدمة غير متاحة</p>
          )}
        </div>

        <div className="rounded-lg border border-tc-line bg-white p-4">
          <h2 className="mb-3 text-base font-extrabold">المخزون</h2>
          {inventory ? (
            <dl className="space-y-2 text-sm">
              <Row label="عدد الأصناف" value={formatNumber(inventory.skus)} />
              <Row label="إجمالي الكميات" value={formatNumber(inventory.totalOnHand)} />
              <Row label="محجوز لطلبات جارية" value={formatNumber(inventory.totalReserved)} />
              <Row label="مخزون منخفض" value={formatNumber(inventory.lowStock)} />
            </dl>
          ) : (
            <p className="text-sm text-tc-muted">الخدمة غير متاحة</p>
          )}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <QuickAction href="/admin/products/new" label="إضافة منتج جديد" icon={Package} />
        <QuickAction href="/admin/orders?status=PENDING" label="مراجعة الطلبات المعلّقة" icon={ShoppingBag} />
        <QuickAction href="/admin/inventory?low=true" label="تعبئة المخزون المنخفض" icon={Boxes} />
      </section>
    </div>
  );
}

function StatCard({
  icon: Icon, label, value, hint, tone, href,
}: {
  icon: typeof Package;
  label: string;
  value: string;
  hint?: string;
  tone?: 'green' | 'red';
  href?: string;
}) {
  const toneClass =
    tone === 'green' ? 'text-tc-leaf' : tone === 'red' ? 'text-tc-berry' : 'text-tc-ink';

  const content = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-tc-muted">{label}</span>
        <Icon className={`size-5 ${toneClass}`} aria-hidden />
      </div>
      <p className={`mt-2 text-2xl font-extrabold tabular ${toneClass}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-tc-muted tabular">{hint}</p>}
    </>
  );

  const className = 'rounded-lg border border-tc-line bg-white p-4 transition hover:shadow-md';
  return href ? (
    <Link href={href} className={className}>{content}</Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

function StatusTile({
  icon: Icon, label, value, tone, href,
}: {
  icon: typeof Package;
  label: string;
  value: number;
  tone: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-1 rounded-lg bg-tc-bg p-3 text-center
                 transition hover:bg-tc-line/50"
    >
      <Icon className={`size-5 ${tone}`} aria-hidden />
      <span className="text-lg font-extrabold tabular">{value}</span>
      <span className="text-[11px] text-tc-muted">{label}</span>
    </Link>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-tc-muted">{label}</dt>
      <dd className="font-semibold tabular">{value}</dd>
    </div>
  );
}

function QuickAction({
  href, label, icon: Icon,
}: {
  href: string;
  label: string;
  icon: typeof Package;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border border-tc-line bg-white p-4
                 text-sm font-semibold transition hover:border-tc-ink"
    >
      <span className="grid size-9 place-items-center rounded-lg bg-tc-accent">
        <Icon className="size-[18px] text-tc-ink" aria-hidden />
      </span>
      {label}
    </Link>
  );
}
