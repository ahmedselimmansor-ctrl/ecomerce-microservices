/**
 * شعار TopChoice.
 *
 * <p>الفكرة: علامة صح ذراعها الطويل يخرج من حدود الختم إلى أعلى اليمين، فتُقرأ
 * ✓ و↑ في شكل واحد — Choice و Top. هذا هو العنصر الوحيد في الواجهة كلها الذي
 * يُسمح له بكسر حاويته؛ تكرار الحيلة في أي مكان آخر يُفقدها معناها.
 *
 * <p>نسختان لأن الشعار يقع على أرضيتين متناقضتين: البترولي الغامق في الهيدر
 * والأبيض في الفوتر ولوحة التحكم. لا نعتمد على الشفافية لأن التباين على
 * الأرضيتين يجب أن يكون مضمونًا لا محتملًا.
 */
type LogoTone = 'onDark' | 'onLight';

const TONES: Record<LogoTone, { seal: string; tick: string; word: string; choice: string }> = {
  onDark: {
    seal: 'var(--color-tc-accent)',
    tick: 'var(--color-tc-brand-deep)',
    word: '#ffffff',
    choice: 'var(--color-tc-accent)',
  },
  onLight: {
    seal: 'var(--color-tc-brand)',
    tick: 'var(--color-tc-accent)',
    word: 'var(--color-tc-ink)',
    choice: 'var(--color-tc-brand)',
  },
};

export function LogoMark({
  tone = 'onDark',
  className = 'size-9',
}: {
  tone?: LogoTone;
  className?: string;
}) {
  const c = TONES[tone];
  return (
    <svg viewBox="0 0 34 34" className={className} fill="none" aria-hidden focusable="false">
      {/* الختم: مربّع بزوايا دائرية يترك فراغًا أعلى اليمين ليخرج منه الذراع */}
      <rect x="1" y="7" width="26" height="26" rx="8.5" fill={c.seal} />
      <path
        d="M8 20.5 L13.4 26 L32 3.6"
        stroke={c.tick}
        strokeWidth="4.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({
  tone = 'onDark',
  className = '',
}: {
  tone?: LogoTone;
  className?: string;
}) {
  const c = TONES[tone];
  return (
    <span className={`flex shrink-0 items-center gap-2 ${className}`} dir="ltr">
      <LogoMark tone={tone} className="size-8 sm:size-9" />
      <span
        className="font-display text-[21px] leading-none tracking-[-0.035em] sm:text-[25px]"
        style={{ color: c.word }}
      >
        <span className="font-medium">Top</span>
        <span className="font-extrabold" style={{ color: c.choice }}>
          Choice
        </span>
      </span>
    </span>
  );
}
