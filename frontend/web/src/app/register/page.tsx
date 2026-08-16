'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useCart } from '@/store/cart';
import { registerSchema } from '@/lib/schemas';
import { ApiError } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const register = useAuth((s) => s.register);
  const mergeCart = useCart((s) => s.mergeAfterLogin);

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});

    const form = new FormData(event.currentTarget);
    const parsed = registerSchema.safeParse({
      fullName: String(form.get('fullName') ?? ''),
      email: String(form.get('email') ?? ''),
      phone: String(form.get('phone') ?? ''),
      password: String(form.get('password') ?? ''),
      confirmPassword: String(form.get('confirmPassword') ?? ''),
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
      await register({
        fullName: parsed.data.fullName,
        email: parsed.data.email,
        password: parsed.data.password,
        phone: parsed.data.phone || undefined,
      });
      await mergeCart().catch(() => undefined);
      toast.success('تم إنشاء حسابك');
      router.push('/');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.userMessage : 'تعذّر إنشاء الحساب');
    } finally {
      setSubmitting(false);
    }
  }

  const fields = [
    { name: 'fullName', label: 'الاسم الكامل', type: 'text', autoComplete: 'name' },
    { name: 'email', label: 'البريد الإلكتروني', type: 'email', autoComplete: 'email' },
    { name: 'phone', label: 'رقم الهاتف (اختياري)', type: 'tel', autoComplete: 'tel' },
    { name: 'password', label: 'كلمة المرور', type: 'password', autoComplete: 'new-password' },
    { name: 'confirmPassword', label: 'تأكيد كلمة المرور', type: 'password', autoComplete: 'new-password' },
  ];

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="card-noon p-6">
        <h1 className="text-xl font-extrabold">إنشاء حساب</h1>
        <p className="mt-1 text-sm text-noon-muted">دقيقة واحدة وتبدأ التسوّق</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {fields.map((field) => (
            <div key={field.name}>
              <label htmlFor={field.name} className="mb-1 block text-xs font-medium text-noon-muted">
                {field.label}
              </label>
              <input
                id={field.name}
                name={field.name}
                type={field.type}
                autoComplete={field.autoComplete}
                aria-invalid={Boolean(errors[field.name])}
                aria-describedby={errors[field.name] ? `${field.name}-error` : undefined}
                className={`w-full rounded-lg border px-3 py-2.5 text-sm
                  ${errors[field.name] ? 'border-noon-red' : 'border-noon-line'}`}
              />
              {errors[field.name] && (
                <p id={`${field.name}-error`} className="mt-1 text-xs text-noon-red">
                  {errors[field.name]}
                </p>
              )}
            </div>
          ))}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-noon-yellow
                       py-2.5 text-sm font-extrabold transition hover:brightness-95
                       disabled:opacity-60"
          >
            {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
            إنشاء الحساب
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-noon-muted">
          لديك حساب بالفعل؟{' '}
          <Link href="/login" className="font-bold text-noon-blue hover:underline">
            تسجيل الدخول
          </Link>
        </p>
      </div>
    </div>
  );
}
