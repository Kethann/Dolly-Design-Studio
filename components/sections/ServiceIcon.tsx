import glow from "./Process.module.css";
import styles from "./Services.module.css";

/** Existing service marks, using the same icon glow as the BTS/Breakdown tiles. */
export function ServiceIcon({ name }: { name: string }) {
  const n = name.toLowerCase();
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return <span className={`${glow.tile} ${styles.badge} glass-glow`} aria-hidden="true">
    <svg viewBox="0 0 48 48" className={glow.icon} {...common}>
      {n.includes("ott") || n.includes("television") ? <>
        <rect x="7" y="10" width="34" height="25" rx="4" />
        <path d="m21 17 10 6-10 6zM18 41h12M24 35v6" />
      </> : n.includes("film") ? <>
        <rect x="9" y="8" width="30" height="32" rx="3" />
        <path d="M16 8v32M32 8v32M9 16h7M9 24h7M9 32h7M32 16h7M32 24h7M32 32h7m-18-14 8 6-8 6z" />
      </> : n.includes("tour") ? <>
        <path d="M12 35V13l20-4v21M12 18l20-4" />
        <ellipse cx="8" cy="35" rx="4" ry="3" /><ellipse cx="28" cy="30" rx="4" ry="3" />
        <path d="m37 7 1.5 3.5L42 12l-3.5 1.5L37 17l-1.5-3.5L32 12l3.5-1.5z" />
      </> : n.includes("promotion") ? <>
        <path d="M9 20h9l18-9v25l-18-9H9zM14 27l3 11h7l-4-11M36 19l4-2M36 28l4 2" />
      </> : n.includes("music") ? <>
        <path d="M20 33V13l18-4v20M20 19l18-4" />
        <ellipse cx="15" cy="34" rx="5" ry="4" />
        <ellipse cx="33" cy="30" rx="5" ry="4" />
      </> : n.includes("poster") ? <>
        <path d="M24 8 L30 24 L24 34 L18 24 Z" />
        <circle cx="24" cy="24" r="1.6" />
        <path d="M24 34 V40M8 22 C12 12 18 12 24 8 C30 12 36 12 40 22" />
        <circle cx="8" cy="22" r="2" /><circle cx="40" cy="22" r="2" />
      </> : n.includes("title") ? <>
        <rect x="10" y="10" width="28" height="28" />
        <path d="M18 18 H30 M24 18 V31" />
        {[[10,10],[38,10],[10,38],[38,38]].map(([x,y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="2.4" fill="var(--icon-bg, #12060a)" />)}
      </> : n.includes("typo") ? <>
        <rect x="8" y="14" width="32" height="20" />
        <path d="M17 21 H27 M22 21 V29M34 11 V37 M31 11 H37 M31 37 H37" />
      </> : n.includes("logo") ? <>
        <circle cx="24" cy="24" r="14" /><circle cx="24" cy="24" r="8" />
        <path d="M20 24 H28" />
        <circle cx="10" cy="24" r="2" /><circle cx="38" cy="24" r="2" />
      </> : <path d="M24 8 L28 20 L40 24 L28 28 L24 40 L20 28 L8 24 L20 20 Z" />}
    </svg>
  </span>;
}
