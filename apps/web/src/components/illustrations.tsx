/**
 * Animated vector art in the university's own colours: #1B4580 navy and #357ABD blue from the
 * crest, with the flag's #E30A17 as a single accent. Everything is inline SVG using the theme
 * tokens, so the drawings follow light and dark mode and cost no network request.
 *
 * The travertine terraces of Pamukkale — the white stepped pools the university is named after —
 * are the recurring shape, which is why several of these are built from stacked curves.
 */

import * as React from 'react';

/** Soft layered terraces used as a page backdrop. Decorative only. */
export function TerraceBackdrop({ className = '' }: { className?: string }) {
  // The same illustration can appear twice on a page (desktop panel + phone header), so the
  // gradient ids must be unique per instance or the second copy paints with nothing.
  const uid = React.useId().replace(/:/g, '');
  return (
    <svg className={className} viewBox="0 0 1200 320" fill="none" aria-hidden preserveAspectRatio="none">
      <defs>
        <linearGradient id={`tb-a-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(var(--brand-blue))" stopOpacity="0.20" />
          <stop offset="100%" stopColor="hsl(var(--brand-navy))" stopOpacity="0.10" />
        </linearGradient>
        <linearGradient id={`tb-b-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(var(--brand-navy))" stopOpacity="0.14" />
          <stop offset="100%" stopColor="hsl(var(--brand-blue))" stopOpacity="0.07" />
        </linearGradient>
      </defs>
      <path d="M0 196c140-34 250 18 388-6s214-74 352-58 300 74 460 44v144H0z" fill={`url(#tb-a-${uid})`} className="float-slower" />
      <path d="M0 246c160-28 268 12 404-8s236-56 376-42 268 60 420 36v88H0z" fill={`url(#tb-b-${uid})`} className="float-slow float-delay" />
    </svg>
  );
}

/** Sign-in art: the crest's two squares over terraces, with a scanning sweep. */
export function SignInArt({ className = '' }: { className?: string }) {
  const uid = React.useId().replace(/:/g, '');
  return (
    <svg className={className} viewBox="0 0 240 180" fill="none" aria-hidden>
      <defs>
        <linearGradient id={`si-sq1-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(var(--brand-blue))" />
          <stop offset="100%" stopColor="hsl(var(--brand-blue))" stopOpacity="0.65" />
        </linearGradient>
        <linearGradient id={`si-sq2-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(var(--brand-navy))" />
          <stop offset="100%" stopColor="hsl(var(--brand-navy))" stopOpacity="0.75" />
        </linearGradient>
      </defs>
      <circle cx="120" cy="86" r="74" stroke="hsl(var(--brand-navy))" strokeOpacity="0.18" strokeWidth="2" />
      <circle cx="120" cy="86" r="62" stroke="hsl(var(--brand-blue))" strokeOpacity="0.28" strokeWidth="1.5" className="spin-slow" strokeDasharray="6 10" />
      {/* The crest's offset squares. */}
      <rect x="118" y="44" width="56" height="56" rx="4" fill={`url(#si-sq1-${uid})`} className="float-slow" />
      <rect x="74" y="74" width="56" height="56" rx="4" fill={`url(#si-sq2-${uid})`} className="float-slow float-delay" />
      {/* The cloud/terrace sweep that divides them on the crest. */}
      <path d="M72 92c18-12 36 4 54-6s34-2 46-10" stroke="white" strokeOpacity="0.9" strokeWidth="7" strokeLinecap="round" />
      <circle cx="196" cy="42" r="5" fill="hsl(var(--brand-red))" className="float-slow" />
    </svg>
  );
}

/** Student scan art: a phone reading a rotating marker. */
export function ScanArt({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 220 160" fill="none" aria-hidden>
      <rect x="16" y="26" width="76" height="118" rx="12" fill="hsl(var(--brand-navy))" className="float-slow" />
      <rect x="23" y="36" width="62" height="98" rx="6" fill="hsl(var(--card))" />
      <rect x="44" y="30" width="20" height="4" rx="2" fill="hsl(var(--card))" opacity="0.5" />
      {/* Marker on the projector. */}
      <rect x="128" y="44" width="72" height="72" rx="6" fill="hsl(var(--brand-navy))" className="float-slow float-delay" />
      <g fill="hsl(var(--card))">
        <rect x="140" y="56" width="16" height="16" />
        <rect x="172" y="56" width="16" height="16" />
        <rect x="156" y="72" width="16" height="16" />
        <rect x="140" y="88" width="16" height="16" />
        <rect x="172" y="88" width="16" height="16" />
      </g>
      {/* Scan beam from phone to marker. */}
      <path d="M92 86h30" stroke="hsl(var(--brand-blue))" strokeWidth="3" strokeLinecap="round" strokeDasharray="4 7">
        <animate attributeName="stroke-dashoffset" from="22" to="0" dur="1.1s" repeatCount="indefinite" />
      </path>
      <circle cx="164" cy="80" r="44" stroke="hsl(var(--brand-blue))" strokeOpacity="0.35" strokeWidth="2" className="pulse-ring" />
      <circle cx="54" cy="120" r="7" fill="hsl(var(--brand-red))" />
    </svg>
  );
}

/** Empty-state art: terraces with nothing on them yet. */
export function EmptyArt({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 180 120" fill="none" aria-hidden>
      <ellipse cx="90" cy="98" rx="66" ry="12" fill="hsl(var(--brand-navy))" fillOpacity="0.08" />
      <path d="M30 86c14-22 38-6 52-22s38-6 52-24" stroke="hsl(var(--brand-blue))" strokeOpacity="0.5" strokeWidth="4" strokeLinecap="round" className="draw-in" pathLength={1} />
      <path d="M38 98c16-18 40-4 54-18s36-4 50-18" stroke="hsl(var(--brand-navy))" strokeOpacity="0.3" strokeWidth="4" strokeLinecap="round" className="draw-in" pathLength={1} style={{ animationDelay: '.25s' }} />
      <circle cx="140" cy="30" r="10" fill="hsl(var(--brand-blue))" fillOpacity="0.22" className="float-slow" />
      <circle cx="46" cy="34" r="5" fill="hsl(var(--brand-red))" fillOpacity="0.5" className="float-slow float-delay" />
    </svg>
  );
}

/** Success art for a confirmed check-in. */
export function SuccessArt({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 140 140" fill="none" aria-hidden>
      <circle cx="70" cy="70" r="56" fill="hsl(var(--success))" fillOpacity="0.12" />
      <circle cx="70" cy="70" r="56" stroke="hsl(var(--success))" strokeOpacity="0.4" strokeWidth="2" className="pulse-ring" />
      <circle cx="70" cy="70" r="40" fill="hsl(var(--success))" fillOpacity="0.18" />
      <path
        d="M50 71l14 14 27-29"
        stroke="hsl(var(--success))"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="draw-in"
        pathLength={1}
      />
    </svg>
  );
}
