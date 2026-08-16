'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import {
  LayoutDashboard, Package, ShoppingBag, Boxes, ArrowRight, ShieldAlert, Loader2,
} from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useHydrated } from '@/lib/use-hydrated';

const LINKS = [
  { href: '/admin', label: 'لوحة المؤشرات', icon: LayoutDashboard, exact: true },
  { href: '/admin/products', label: 'المنتجات', icon: Package },
  { href: '/admin/orders', label: 'الطلبات', icon: ShoppingBag },
  { href: '/admin/inventory', label: 'المخزون', icon: Boxes },
];

/**
 * غلاف لوحة التحكم.
 *
 * <p>الحماية هنا واجهة فقط — إخفاء زر لا يمنع أحدًا. الحاجز الحقيقي في
 * الـ api-gateway: كل مسار {@code /api/v1/admin/*} يتطلب دور ADMIN مُتحقَّقًا
 * من توكن موقّع، والخدمات نفسها محجوبة خلف NetworkPolicy.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const hydrated = useHydrated();

  const isAdmin = user?.roles.includes('ADMIN') ?? false;

  useEffect(() => {
    if (hydrated && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [hydrated, user, pathname, router]);

  if (!hydrated) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Loader2 className="size-8 animate-spin text-noon-muted" aria-hidden />
      </div>
    );
  }

  if (!user) return null;

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <ShieldAlert className="mx-auto size-14 text-noon-red" aria-hidden />
        <h1 className="mt-4 text-xl font-extrabold">لا تملك صلاحية الوصول</h1>
        <p className="mt-2 text-sm text-noon-muted">
          هذه الصفحة مخصّصة لحسابات المشرفين فقط.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-lg bg-noon-yellow px-6 py-2.5 text-sm font-bold"
        >
          العودة للمتجر
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1440px] gap-4 px-4 py-4">
      <aside className="hidden w-56 shrink-0 lg:block">
        <div className="sticky top-28 space-y-1">
          <div className="mb-3 rounded-lg bg-noon-ink px-4 py-3">
            <p className="text-[13px] text-white/60">مرحبًا</p>
            <p className="truncate text-sm font-bold text-white">{user.fullName}</p>
          </div>

          <nav aria-label="أقسام لوحة التحكم">
            <ul className="space-y-1">
              {LINKS.map((link) => {
                const active = link.exact
                  ? pathname === link.href
                  : pathname.startsWith(link.href);
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm
                        font-semibold transition
                        ${active
                          ? 'bg-noon-yellow text-noon-ink'
                          : 'text-noon-ink hover:bg-white'}`}
                    >
                      <link.icon className="size-[18px]" aria-hidden />
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <Link
            href="/"
            className="mt-4 flex items-center gap-2 rounded-lg border border-noon-line
                       bg-white px-3 py-2.5 text-sm font-semibold text-noon-blue"
          >
            <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
            العودة للمتجر
          </Link>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        {/* تنقّل أفقي على الشاشات الصغيرة */}
        <nav className="scrollbar-none mb-4 flex gap-2 overflow-x-auto lg:hidden">
          {LINKS.map((link) => {
            const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold
                  ${active ? 'bg-noon-ink text-white' : 'bg-white text-noon-ink'}`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {children}
      </main>
    </div>
  );
}
