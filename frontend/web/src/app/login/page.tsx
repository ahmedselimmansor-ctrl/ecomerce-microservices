'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useCart } from '@/store/cart';
import { loginSchema } from '@/lib/schemas';
import { ApiError } from '@/lib/api';

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center">…</div>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useAuth((s) => s.login);
  const mergeCart = useCart((s) => s.mergeAfterLogin);

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const next = searchParams.get('next') ?? '/';

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});

    const form = new FormData(event.currentTarget);
    const parsed = loginSchema.safeParse({
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
    });

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === 'string') fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    try {
      await login(parsed.data.email, parsed.data.password);
      // دمج سلة الزائر فورًا — وإلا فقد المستخدم ما أضافه قبل الدخول
      await mergeCart().catch(() => undefined);
      toast.success('أهلًا بعودتك');
      router.push(next);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.userMessage : 'تعذّر تسجيل الدخول');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="card-tc p-6">
        <h1 className="text-xl font-extrabold">تسجيل الدخول</h1>
        <p className="mt-1 text-sm text-tc-muted">أدخل بياناتك للمتابعة</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-xs font-medium text-tc-muted">
              البريد الإلكتروني
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              defaultValue="demo@topchoice.local"
              aria-invalid={Boolean(errors.email)}
              className={`w-full rounded-lg border px-3 py-2.5 text-sm
                ${errors.email ? 'border-tc-berry' : 'border-tc-line'}`}
            />
            {errors.email && <p className="mt-1 text-xs text-tc-berry">{errors.email}</p>}
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-xs font-medium text-tc-muted">
              كلمة المرور
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              defaultValue="Passw0rd!"
              aria-invalid={Boolean(errors.password)}
              className={`w-full rounded-lg border px-3 py-2.5 text-sm
                ${errors.password ? 'border-tc-berry' : 'border-tc-line'}`}
            />
            {errors.password && <p className="mt-1 text-xs text-tc-berry">{errors.password}</p>}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-tc-accent
                       py-2.5 text-sm font-extrabold transition hover:brightness-95
                       disabled:opacity-60"
          >
            {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
            دخول
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-tc-muted">
          ليس لديك حساب؟{' '}
          <Link href="/register" className="font-bold text-tc-link hover:underline">
            إنشاء حساب
          </Link>
        </p>

        <p className="mt-4 rounded-lg bg-tc-bg p-3 text-xs leading-relaxed text-tc-muted">
          حساب تجريبي جاهز: <code>demo@topchoice.local</code> / <code>Passw0rd!</code>
        </p>
      </div>
    </div>
  );
}
