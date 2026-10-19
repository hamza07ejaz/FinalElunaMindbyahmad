import Link from "next/link";

/**
 * The mark: two hemispheres, a seam, and light where they meet.
 *
 * Drawn rather than loaded so it stays crisp at every size, inherits the
 * spectrum tokens, and costs no request. An admin who uploads a logo in
 * Branding replaces it with that image.
 */
export function LogoMark({ size = 34, id = "lm" }: { size?: number; id?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id={`${id}-sweep`} x1="4" y1="20" x2="36" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--s1)" />
          <stop offset="0.3" stopColor="var(--s2)" />
          <stop offset="0.58" stopColor="var(--s3)" />
          <stop offset="0.78" stopColor="var(--s4)" />
          <stop offset="1" stopColor="var(--s5)" />
        </linearGradient>
        <radialGradient id={`${id}-spark`} cx="0.5" cy="0.5" r="0.5">
          <stop stopColor="#fff" />
          <stop offset="0.35" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g stroke={`url(#${id}-sweep)`} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" fill="none">
        {/* left hemisphere */}
        <path d="M18.4 7.2c-3.5-1.6-7.2.1-8.3 3.2-2.9.5-4.6 3-4.1 5.6-2.2 1.6-2.4 4.6-.6 6.4-.9 2.7.8 5.4 3.6 5.9.6 2.7 3.4 4.3 6.1 3.4 1 1.4 2.4 2.1 3.3 2.1" />
        {/* right hemisphere */}
        <path d="M21.6 7.2c3.5-1.6 7.2.1 8.3 3.2 2.9.5 4.6 3 4.1 5.6 2.2 1.6 2.4 4.6.6 6.4.9 2.7-.8 5.4-3.6 5.9-.6 2.7-3.4 4.3-6.1 3.4-1 1.4-2.4 2.1-3.3 2.1" />
        {/* the folds: enough to read as a brain, not so many it muddies at 24px */}
        <path d="M14.6 12.4c1.8-.3 3 .7 3.1 2.2M11.2 18.2c2.1-.5 3.6.6 3.7 2.4M13.6 25c1.6-.9 3.2-.3 3.8 1.1" opacity="0.85" />
        <path d="M25.4 12.4c-1.8-.3-3 .7-3.1 2.2M28.8 18.2c-2.1-.5-3.6.6-3.7 2.4M26.4 25c-1.6-.9-3.2-.3-3.8 1.1" opacity="0.85" />
      </g>

      {/* the seam, and the light on it */}
      <line x1="20" y1="6.4" x2="20" y2="33.6" stroke={`url(#${id}-sweep)`} strokeWidth="1.6" strokeLinecap="round" opacity="0.5" />
      <circle cx="20" cy="19.6" r="6" fill={`url(#${id}-spark)`} />
      <circle cx="20" cy="19.6" r="1.7" fill="#fff" />
    </svg>
  );
}

export function Logo({ href = "/", size = 34, logoUrl = "", siteName = "Eluna Mind", showName = true }:
  { href?: string; size?: number; logoUrl?: string; siteName?: string; showName?: boolean }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5 text-paper">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" width={size} height={size} className="rounded-xl object-contain"
          style={{ width: size, height: size }} />
      ) : (
        <LogoMark size={size} />
      )}
      {showName && <span className="font-display text-[1.06rem] font-semibold tracking-tight">{siteName}</span>}
    </Link>
  );
}
