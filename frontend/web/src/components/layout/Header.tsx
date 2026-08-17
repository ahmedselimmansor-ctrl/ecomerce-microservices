'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  ShoppingCart, Search, User, LogOut, Package, MapPin, Heart, ChevronDown,
  Languages, LayoutDashboard, X,
} from 'lucide-react';
import { z } from 'zod';
import { useAuth } from '@/store/auth';
import { useCart } from '@/store/cart';
import { useWishlist } from '@/store/wishlist';
import { api } from '@/lib/api';
import { formatMoney, PLACEHOLDER_IMAGE } from '@/lib/format';
import { CategoryNav } from './CategoryNav';
import { Logo } from './Logo';

const suggestSchema = z.object({
  query: z.string(),
  suggestions: z.array(
    z.object({
      sku: z.string(),
      slug: z.string().nullable().optional(),
      title: z.string().nullable().optional(),
      image: z.string().nullable().optional(),
      priceMinor: z.number().nullable().optional(),
      currency: z.string().nullable().optional(),
      brandName: z.string().nullable().optional(),
    }),
  ),
});

type Suggestion = z.infer<typeof suggestSchema>['suggestions'][number];

const RECENT_KEY = 'topchoice-recent-searches';

export function Header() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const snapshot = useCart((s) => s.snapshot);
  const refreshCart = useCart((s) => s.refresh);
  const wishlistCount = useWishlist((s) => s.items.length);

  const isAdmin = user?.roles.includes('ADMIN') ?? false;
  const itemCount = snapshot?.items.reduce((sum, i) => sum + i.quantity, 0) ?? 0;

  useEffect(() => {
    void refreshCart().catch(() => undefined);
  }, [refreshCart, user?.id]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_KEY);
      if (stored) setRecent(JSON.parse(stored) as string[]);
    } catch {
      // تخزين محلي غير متاح (وضع التصفح الخاص) — نتجاهله
    }
  }, []);

  /** الإكمال التلقائي مع debounce — بدونه نطلق طلبًا لكل ضغطة زر. */
  useEffect(() => {
    if (query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const result = await api.get(
          `/api/v1/search/suggest?q=${encodeURIComponent(query.trim())}&limit=8`,
          suggestSchema,
          { signal: controller.signal },
        );
        setSuggestions(result.suggestions);
      } catch {
        setSuggestions([]);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) {
        setAccountOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    const next = [trimmed, ...recent.filter((r) => r !== trimmed)].slice(0, 8);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // تجاهل
    }

    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <header className="sticky top-0 z-50">
      {/* --------------------------------------------------------- brand bar */}
      <div className="bg-tc-brand">
        <div className="mx-auto flex max-w-[1440px] items-center gap-3 px-4 py-2.5">
          <Link href="/" aria-label="TopChoice — الصفحة الرئيسية">
            <Logo tone="onDark" />
          </Link>

          <button
            type="button"
            className="hidden shrink-0 items-center gap-1 rounded px-2 py-1 text-sm
                       font-semibold text-white/90 hover:bg-white/10 sm:flex"
          >
            <MapPin className="size-4" aria-hidden />
            <span>Other</span>
            <span className="text-white/45">•</span>
            <span>Cairo</span>
            <ChevronDown className="size-3.5" aria-hidden />
          </button>

          {/* ------------------------------------------------------- search */}
          <div ref={boxRef} className="relative min-w-0 flex-1">
            <form onSubmit={submitSearch} role="search">
              <label htmlFor="site-search" className="sr-only">
                ابحث عن منتج
              </label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute inset-y-0 start-3 my-auto size-[18px]
                             text-tc-muted"
                  aria-hidden
                />
                <input
                  id="site-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setOpen(true)}
                  placeholder="What are you looking for?"
                  autoComplete="off"
                  className="w-full rounded-md border-0 bg-white py-2.5 ps-10 pe-9 text-sm
                             text-tc-ink outline-none placeholder:text-tc-muted"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    aria-label="مسح البحث"
                    className="absolute inset-y-0 end-2 my-auto grid size-6 place-items-center
                               rounded-full text-tc-muted hover:bg-tc-bg"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                )}
              </div>
            </form>

            {open && (suggestions.length > 0 || recent.length > 0) && (
              <div
                className="absolute inset-x-0 top-full z-50 mt-1 max-h-[70vh] overflow-auto
                           rounded-lg border border-tc-line bg-white py-1 shadow-xl"
              >
                {suggestions.length === 0 && recent.length > 0 && (
                  <>
                    <p className="px-3 py-2 text-xs font-bold text-tc-muted">عمليات بحث سابقة</p>
                    {recent.map((term) => (
                      <button
                        key={term}
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          router.push(`/search?q=${encodeURIComponent(term)}`);
                        }}
                        className="flex w-full items-center gap-3 px-3 py-2 text-start
                                   text-sm hover:bg-tc-bg"
                      >
                        <Search className="size-4 text-tc-muted" aria-hidden />
                        {term}
                      </button>
                    ))}
                  </>
                )}

                {suggestions.map((item) => (
                  <Link
                    key={item.sku}
                    href={`/product/${item.slug ?? item.sku}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-tc-bg"
                  >
                    <Image
                      src={item.image || PLACEHOLDER_IMAGE}
                      alt=""
                      width={40}
                      height={40}
                      className="size-10 rounded object-contain"
                      unoptimized={!item.image}
                    />
                    <span className="flex-1 truncate text-sm">{item.title ?? item.sku}</span>
                    {item.priceMinor != null && (
                      <span className="shrink-0 text-sm font-bold tabular">
                        {formatMoney(item.priceMinor, item.currency ?? 'EGP')}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* --------------------------------------------------------- nav */}
          <nav className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              className="hidden items-center gap-1.5 rounded px-2.5 py-2 text-sm font-bold
                         text-white hover:bg-white/10 md:flex"
            >
              <Languages className="size-[18px]" aria-hidden />
              العربية
            </button>

            <div ref={accountRef} className="relative">
              <button
                type="button"
                onClick={() => (user ? setAccountOpen((v) => !v) : router.push('/login'))}
                aria-expanded={accountOpen}
                className="flex items-center gap-1.5 rounded px-2.5 py-2 text-sm font-bold
                           text-white hover:bg-white/10"
              >
                <User className="size-[18px]" aria-hidden />
                <span className="hidden max-w-24 truncate sm:inline">
                  {user ? user.fullName.split(' ')[0] : 'Log in'}
                </span>
              </button>

              {user && accountOpen && (
                <div
                  className="absolute end-0 top-full z-50 mt-1 w-52 rounded-lg border
                             border-tc-line bg-white py-1 shadow-xl"
                >
                  {isAdmin && (
                    <Link
                      href="/admin"
                      onClick={() => setAccountOpen(false)}
                      className="flex items-center gap-2 border-b border-tc-line px-3 py-2.5
                                 text-sm font-bold text-tc-link hover:bg-tc-bg"
                    >
                      <LayoutDashboard className="size-4" aria-hidden /> لوحة التحكم
                    </Link>
                  )}
                  <Link
                    href="/orders"
                    onClick={() => setAccountOpen(false)}
                    className="flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-tc-bg"
                  >
                    <Package className="size-4" aria-hidden /> طلباتي
                  </Link>
                  <Link
                    href="/wishlist"
                    onClick={() => setAccountOpen(false)}
                    className="flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-tc-bg"
                  >
                    <Heart className="size-4" aria-hidden /> المفضّلة
                  </Link>
                  <Link
                    href="/account"
                    onClick={() => setAccountOpen(false)}
                    className="flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-tc-bg"
                  >
                    <MapPin className="size-4" aria-hidden /> حسابي والعناوين
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountOpen(false);
                      void logout();
                      router.push('/');
                      router.refresh();
                    }}
                    className="flex w-full items-center gap-2 border-t border-tc-line px-3
                               py-2.5 text-start text-sm text-tc-berry hover:bg-tc-bg"
                  >
                    <LogOut className="size-4" aria-hidden /> تسجيل الخروج
                  </button>
                </div>
              )}
            </div>

            <Link
              href="/orders"
              className="hidden items-center gap-1.5 rounded px-2.5 py-2 text-sm font-bold
                         text-white hover:bg-white/10 md:flex"
            >
              <Package className="size-[18px]" aria-hidden />
              Orders
            </Link>

            <Link
              href="/wishlist"
              className="relative hidden items-center gap-1.5 rounded px-2.5 py-2 text-sm
                         font-bold text-white hover:bg-white/10 sm:flex"
            >
              <Heart className="size-[18px]" aria-hidden />
              Wishlist
              {wishlistCount > 0 && (
                <span className="absolute -top-0.5 end-1 grid min-w-4 place-items-center
                                 rounded-full bg-tc-accent px-1 text-[10px] font-bold text-tc-ink tabular">
                  {wishlistCount}
                </span>
              )}
            </Link>

            <Link
              href="/cart"
              className="relative flex items-center gap-1.5 rounded px-2.5 py-2 text-sm
                         font-bold text-white hover:bg-white/10"
              aria-label={`السلة، ${itemCount} منتج`}
            >
              <ShoppingCart className="size-[18px]" aria-hidden />
              <span className="hidden sm:inline">Cart</span>
              {itemCount > 0 && (
                <span className="absolute -top-0.5 start-4 grid min-w-4 place-items-center
                                 rounded-full bg-tc-accent px-1 text-[10px] font-bold text-tc-ink tabular">
                  {itemCount}
                </span>
              )}
            </Link>
          </nav>
        </div>
      </div>

      <CategoryNav />
    </header>
  );
}
