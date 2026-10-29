/** A small line icon for each menu item (by the section it opens), and the glow colour that item takes when it is the page you are on. */
export const NAV_TONES: Record<string, string> = {
  agency: "#ffc857",
  clients: "#3ddcff",
  about: "#ff6ec7",
  work: "#9b6bff",
  process: "#4d8bff",
  services: "#3df2b0",
  contact: "#ff7a59",
};

const PATHS: Record<string, React.ReactNode> = {
  // a studio building
  agency: (
    <>
      <path d="M4 20V7l8-3.5L20 7v13" />
      <path d="M9.5 20v-5h5v5" />
      <path d="M8 10h1.5M14.5 10H16" />
    </>
  ),
  // two people: the clients and collaborators
  clients: (
    <>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19.5c0-3 2.5-5.4 5.5-5.4s5.5 2.4 5.5 5.4" />
      <path d="M15.5 5.8a3 3 0 0 1 0 5.4M17.5 14.4c1.7.8 3 2.6 3 5.1" />
    </>
  ),
  // the founder: a person with a spark
  about: (
    <>
      <circle cx="11" cy="9" r="3.4" />
      <path d="M4.5 20c0-3.6 2.9-6.4 6.5-6.4s6.5 2.8 6.5 6.4" />
      <path d="M19 3.5l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z" />
    </>
  ),
  // a gallery of frames
  work: (
    <>
      <rect x="3.5" y="4" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="4" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
  // layers: how a design is built
  process: (
    <>
      <path d="M12 3.5l8.5 4.7L12 13 3.5 8.2z" />
      <path d="M3.5 12.3L12 17l8.5-4.7" />
      <path d="M3.5 16.3L12 21l8.5-4.7" />
    </>
  ),
  // a sparkle: what the studio offers
  services: (
    <>
      <path d="M11 3.5l2 5.5 5.5 2-5.5 2-2 5.5-2-5.5-5.5-2 5.5-2z" />
      <path d="M19 15.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" />
    </>
  ),
  // an envelope
  contact: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.2" />
      <path d="M4 7.5l8 5.5 8-5.5" />
    </>
  ),
};

export function NavIcon({ id, className }: { id: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[id] ?? <circle cx="12" cy="12" r="3" />}
    </svg>
  );
}
