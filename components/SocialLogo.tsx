/**
 * The studio's social links as their own logos (Instagram, X and IMDb), drawn here so they need no downloads. They are drawn
 * in one colour (the button's own light), not their brand colours. Used wherever the social links are shown.
 */
export function SocialLogo({ label }: { label: string }) {
  const n = label.trim().toLowerCase();
  if (n === "instagram")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5.2" fill="none" stroke="currentColor" strokeWidth="1.9" />
        <circle cx="12" cy="12" r="4.1" fill="none" stroke="currentColor" strokeWidth="1.9" />
        <circle cx="17.2" cy="6.8" r="1.2" fill="currentColor" />
      </svg>
    );
  if (n === "x" || n === "twitter")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    );
  if (n === "imdb")
    return (
      <svg viewBox="0 0 44 22" aria-hidden="true">
        <text x="22" y="17" textAnchor="middle" fontFamily="Arial Black, Arial, Helvetica, sans-serif" fontWeight="900" fontSize="17" fill="currentColor">
          IMDb
        </text>
      </svg>
    );
  const line = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  if (n === "youtube")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="2.5" y="5.5" width="19" height="13" rx="4" {...line} />
        <path fill="currentColor" d="M10 9.2v5.6l4.8-2.8z" />
      </svg>
    );
  if (n === "facebook")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...line} d="M14.2 21v-8h2.7l.5-3.2h-3.2V7.9c0-.9.4-1.6 1.7-1.6h1.6V3.5a17 17 0 0 0-2.4-.2c-2.4 0-4 1.5-4 4.1v2.4H8.3V13h2.8v8z" />
      </svg>
    );
  if (n === "linkedin")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="4" {...line} />
        <path {...line} d="M8 10.5V16M8 7.6v.1M11.5 16v-5.5M11.5 13c0-1.6 1-2.6 2.3-2.6 1.4 0 2.2 1 2.2 2.6V16" />
      </svg>
    );
  if (n === "behance")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...line} d="M3 6.5h5a2.3 2.3 0 0 1 0 4.6H3zM3 11.1h5.5a2.5 2.5 0 0 1 0 5H3zM3 6.5v9.6M14.5 8h5M14 13.5h6.2c0-2-1.2-3.3-3.1-3.3S14 11.5 14 13.5c0 2.1 1.2 3.2 3.2 3.2 1.1 0 2-.4 2.6-1.2" />
      </svg>
    );
  if (n === "whatsapp")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...line} d="M3.5 20.5l1.3-4.2A8.5 8.5 0 1 1 8 19.4z" />
        <path fill="currentColor" d="M9 8.8c.3 2.6 2.6 5 5.4 5.6l1.2-1.3-2-1-.9.7a4 4 0 0 1-1.9-1.9l.7-.9-1-2z" />
      </svg>
    );
  if (n === "website")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" {...line} />
        <path {...line} d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9S14.6 18.4 12 21c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z" />
      </svg>
    );
  return <span>{label}</span>;
}
