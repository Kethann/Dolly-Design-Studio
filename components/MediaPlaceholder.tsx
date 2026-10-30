import styles from "./MediaPlaceholder.module.css";

/** Keeps an empty artwork slot deliberate and stable until a picture is chosen in the portal. */
export function MediaPlaceholder({ label = "Artwork to follow" }: { label?: string }) {
  return <span className={styles.placeholder} role="img" aria-label={label}><span>{label}</span></span>;
}
