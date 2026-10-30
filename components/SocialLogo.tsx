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
  return <span>{label}</span>;
}
