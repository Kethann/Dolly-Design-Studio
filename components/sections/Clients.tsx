import { clients, collaborators, testimonials } from "@/content/clients";
import { home } from "@/content/home";
import styles from "./Clients.module.css";

export function Clients() {
  const names = [...clients, ...collaborators];
  const loop = [...names, ...names];

  return (
    <section id="clients" className={styles.section}>
      <div className="container">
        <span className={styles.label}>{home.clients.label}</span>
        <h2 className={styles.title}>{home.clients.title}</h2>

        <div className={styles.marqueeViewport} aria-hidden="true">
          <div className={styles.marqueeTrack}>
            {loop.map((name, i) => (
              <span key={i}>{name}</span>
            ))}
          </div>
        </div>
        <p className="sr-only">
          {home.clients.screenReaderIntro} {names.join(", ")}.
        </p>

        {testimonials.length > 0 && (
          <blockquote style={{ marginTop: 56, textAlign: "center" }}>
            <p style={{ fontFamily: "var(--font-display)", fontSize: "clamp(18px,2.4vw,26px)" }}>“{testimonials[0].quote}”</p>
            <footer
              style={{
                marginTop: 12,
                opacity: 0.65,
                fontFamily: "var(--font-label)",
                fontSize: 11,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
              }}
            >
              {testimonials[0].name} · {testimonials[0].role}
            </footer>
          </blockquote>
        )}
      </div>
    </section>
  );
}
