/**
 * Empirical monogram: an epsilon-inspired open E — a graphite arc with a
 * detached sea-glass crossbar. Code-native vector (master: brand-source/empirical-mark.svg).
 * Decorative: the enclosing button supplies the accessible name.
 */
export function BrandMark({ small }: { small?: boolean }) {
  const size = small ? 24 : 28;
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M24.5 7.96A10.5 10.5 0 1 0 24.5 24.04" fill="none" stroke="var(--label)" strokeWidth="3.6" strokeLinecap="round" />
      <path d="M12.6 16H20.6" fill="none" stroke="var(--accent)" strokeWidth="3.6" strokeLinecap="round" />
    </svg>
  );
}
