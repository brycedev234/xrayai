export function BrandMark({ className = "" }: { className?: string }) {
  // A rib-cage cross-section inside a lens ring.
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden>
      <circle cx="16" cy="16" r="14.5" stroke="currentColor" strokeOpacity="0.5" />
      <path d="M16 6v20" stroke="currentColor" strokeWidth="1.6" />
      <path d="M15 10c-4-2-7 0-8 3M17 10c4-2 7 0 8 3M15 15c-4-2-7 0-8 3M17 15c4-2 7 0 8 3M15 20c-3-1.5-5.5 0-6.5 2.5M17 20c3-1.5 5.5 0 6.5 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="21" cy="21.5" r="2.4" fill="var(--infra)" />
    </svg>
  );
}
