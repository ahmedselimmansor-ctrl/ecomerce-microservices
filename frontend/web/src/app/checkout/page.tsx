'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Loader2, CreditCard, Banknote } from 'lucide-react';
import { useCart } from '@/store/cart';
import { useAuth } from '@/store/auth';
import { useHydrated } from '@/lib/use-hydrated';
import { api, ApiError } from '@/lib/api';
import { checkoutSchema, orderSchema, type CheckoutInput } from '@/lib/schemas';
import { formatMoney } from '@/lib/format';

type FieldErrors = Partial<Record<string, string>>;

export default function CheckoutPage() {
  const router = useRouter();
  const snapshot = useCart((s) => s.snapshot);
  const refreshCart = useCart((s) => s.refresh);
  const user = useAuth((s) => s.user);
  const hydrated = useHydrated();
  const getValidToken = useAuth((s) => s.getValidToken);

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [method, setMethod] = useState<CheckoutInput['paymentMethod']>('CARD');

  useEffect(() => {
    void refreshCart().catch(() => undefined);
  }, [refreshCart]);

  useEffect(() => {
    if (hydrated && !user) {
      router.replace('/login?next=/checkout');
    }
  }, [hydrated, user, router]);

  if (!hydrated || !user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <Loader2 className="mx-auto size-8 animate-spin text-tc-muted" aria-hidden />
      </div>
    );
  }

  const items = snapshot?.items ?? [];
  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-xl font-extrabold">سلتك فارغة</h1>
        <Link href="/" className="mt-4 inline-flex rounded-lg bg-tc-accent px-6 py-2.5 text-sm font-bold">
          تصفّح المنتجات
        </Link>
      </div>
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});

    const form = new FormData(event.currentTarget);
    const input = {
      shippingAddress: {
        fullName: String(form.get('fullName') ?? ''),
        phone: String(form.get('phone') ?? ''),
        line1: String(form.get('line1') ?? ''),
        line2: String(form.get('line2') ?? ''),
        area: String(form.get('area') ?? ''),
        city: String(form.get('city') ?? ''),
        country: 'AE',
      },
      paymentMethod: method,
      couponCode: String(form.get('couponCode') ?? ''),
    };

    // التحقق على العميل للتجربة فقط — الخادم يتحقق مجددًا دائمًا
    const parsed = checkoutSchema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[issue.path.length - 1];
        if (typeof key === 'string') fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      toast.error('راجع البيانات المدخلة');
      return;
    }

    setSubmitting(true);
    try {
      const token = await getValidToken();
      if (!token) {
        router.replace('/login?next=/checkout');
        return;
      }

      // مفتاح idempotency: ضغطة مزدوجة أو إعادة محاولة الشبكة لن تنشئ طلبين
      const idempotencyKey = crypto.randomUUID();

      const order = await api.post(
        '/api/v1/orders',
        orderSchema,
        {
          items: items.map((i) => ({ sku: i.sku, quantity: i.quantity })),
          shippingAddress: parsed.data.shippingAddress,
          paymentMethod: parsed.data.paymentMethod,
          couponCode: parsed.data.couponCode || undefined,
        },
        { token, idempotencyKey },
      );

      toast.success('تم استلام طلبك', { description: `رقم الطلب ${order.orderNumber}` });
      await useCart.getState().clear().catch(() => undefined);
      router.push(`/orders/${order.id}`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.userMessage : 'تعذّر إتمام الطلب');
    } finally {
      setSubmitting(false);
    }
  }

  const subtotal = snapshot?.subtotalMinor ?? 0;
  const shipping = subtotal >= 10_000 ? 0 : 1_500;
  const vat = Math.round((subtotal * 5) / 100);
  const total = subtotal + shipping + vat;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="mb-4 text-xl font-extrabold sm:text-2xl">إتمام الشراء</h1>

      <form onSubmit={handleSubmit} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <fieldset className="card-tc space-y-3 p-4">
            <legend className="text-base font-extrabold">عنوان التوصيل</legend>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field name="fullName" label="الاسم الكامل" defaultValue={user.fullName}
                     error={errors.fullName} required />
              <Field name="phone" label="رقم الهاتف" type="tel" placeholder="+9715xxxxxxx"
                     defaultValue={user.phone ?? ''} error={errors.phone} required />
            </div>

            <Field name="line1" label="العنوان" placeholder="الشارع، المبنى، الشقة"
                   error={errors.line1} required />
            <Field name="line2" label="تفاصيل إضافية (اختياري)" error={errors.line2} />

            <div className="grid gap-3 sm:grid-cols-2">
              <Field name="area" label="المنطقة" error={errors.area} />
              <Field name="city" label="المدينة" defaultValue="Dubai" error={errors.city} required />
            </div>
          </fieldset>

          <fieldset className="card-tc space-y-2 p-4">
            <legend className="text-base font-extrabold">طريقة الدفع</legend>

            {[
              { value: 'CARD' as const, label: 'بطاقة ائتمان / مدى', icon: CreditCard },
              { value: 'COD' as const, label: 'الدفع عند الاستلام', icon: Banknote },
            ].map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition
                  ${method === option.value
                    ? 'border-tc-ink bg-tc-bg'
                    : 'border-tc-line hover:border-tc-muted'}`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value={option.value}
                  checked={method === option.value}
                  onChange={() => setMethod(option.value)}
                  className="size-4"
                />
                <option.icon className="size-5 text-tc-muted" aria-hidden />
                <span className="text-sm font-medium">{option.label}</span>
              </label>
            ))}

            <p className="pt-1 text-xs text-tc-muted">
              بيئة تجريبية: لا تُدخل بيانات بطاقة حقيقية. الدفع يُحاكى ببوابة وهمية.
            </p>
          </fieldset>
        </div>

        <aside className="card-tc h-fit space-y-3 p-4 lg:sticky lg:top-24">
          <h2 className="text-base font-extrabold">ملخّص الطلب</h2>

          <div>
            <label htmlFor="couponCode" className="mb-1 block text-xs text-tc-muted">
              كود الخصم
            </label>
            <input
              id="couponCode"
              name="couponCode"
              placeholder="TOPCHOICE10"
              className="w-full rounded-lg border border-tc-line px-3 py-2 text-sm uppercase"
            />
          </div>

          <dl className="space-y-2 border-t border-tc-line pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-tc-muted">المجموع الفرعي</dt>
              <dd className="tabular">{formatMoney(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-tc-muted">الشحن</dt>
              <dd className="tabular">
                {shipping === 0 ? <span className="text-tc-leaf">مجاني</span> : formatMoney(shipping)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-tc-muted">ضريبة القيمة المضافة</dt>
              <dd className="tabular">{formatMoney(vat)}</dd>
            </div>
            <div className="flex justify-between border-t border-tc-line pt-2 text-base font-extrabold">
              <dt>الإجمالي</dt>
              <dd className="tabular">{formatMoney(total)}</dd>
            </div>
          </dl>

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-tc-accent
                       py-3 text-sm font-extrabold transition hover:brightness-95
                       disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
            تأكيد الطلب
          </button>
        </aside>
      </form>
    </div>
  );
}

interface FieldProps {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
  error?: string;
  required?: boolean;
}

function Field({ name, label, type = 'text', placeholder, defaultValue, error, required }: FieldProps) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-xs font-medium text-tc-muted">
        {label}
        {required && <span className="text-tc-berry"> *</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${name}-error` : undefined}
        className={`w-full rounded-lg border px-3 py-2 text-sm
          ${error ? 'border-tc-berry' : 'border-tc-line'}`}
      />
      {error && (
        <p id={`${name}-error`} className="mt-1 text-xs text-tc-berry">
          {error}
        </p>
      )}
    </div>
  );
}
