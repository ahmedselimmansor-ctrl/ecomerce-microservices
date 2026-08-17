'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // في الإنتاج يُرسل هذا إلى CloudWatch RUM / Sentry
    console.error('render error', error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="text-xl font-extrabold">حدث خطأ غير متوقع</h1>
      <p className="mt-2 text-sm text-tc-muted">
        نعتذر عن ذلك. يمكنك المحاولة مرة أخرى.
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-tc-muted tabular">رمز الخطأ: {error.digest}</p>
      )}
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-lg bg-tc-accent px-6 py-2.5 text-sm font-bold"
      >
        إعادة المحاولة
      </button>
    </div>
  );
}
