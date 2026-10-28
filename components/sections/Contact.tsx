"use client";

import { useState } from "react";
import { useContent, tx } from "@/lib/content/context";
import { Magnetic } from "@/components/Magnetic";
import styles from "./Contact.module.css";

type Status = "idle" | "sending" | "sent" | "error";

export function Contact() {
  const { site, home } = useContent();
  const copy = home.contact;
  const form = copy.form;
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [flakes, setFlakes] = useState<{ id: number; left: number; delay: number }[]>([]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");

    const formEl = e.currentTarget;
    const data = Object.fromEntries(new FormData(formEl).entries());

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || form.errors.generic);
      setStatus("sent");
      setFlakes(
        Array.from({ length: 24 }, (_, i) => ({ id: i, left: Math.random() * 100, delay: Math.random() * 0.6 })),
      );
      formEl.reset();
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : form.errors.generic);
    }
  }

  return (
    <section id="contact" className={styles.section}>
      <div className={styles.glow} aria-hidden="true" />
      {flakes.length > 0 && (
        <div className={styles.flakes} aria-hidden="true">
          {flakes.map((f) => (
            <span key={f.id} className={styles.flake} style={{ left: `${f.left}%`, animationDelay: `${f.delay}s` }} />
          ))}
        </div>
      )}

      <div className="container">
        <span className={styles.label} {...tx("home.contact.label")}>{copy.label}</span>
        <h2 className={styles.headline} {...tx("home.contact.headline")}>{copy.headline}</h2>
        <p className={styles.availability} {...tx("home.contact.availability")}>{copy.availability}</p>

        <div className={styles.grid}>
          <div className={styles.quickLinks}>
            <Magnetic>
              <a href={`mailto:${site.contact.email}`} className={styles.emailButton} data-cursor="link">
                {site.contact.email}
              </a>
            </Magnetic>
            <p className={styles.contactRow}>
              <a href={site.contact.phoneHref} data-cursor="link">
                {site.contact.phone}
              </a>
            </p>
            <p className={styles.contactRow}>
              <a href={site.contact.whatsapp} target="_blank" rel="noreferrer" data-cursor="link">
                {copy.whatsappLabel}
              </a>
            </p>
            <p className={styles.contactRow}>{site.contact.location}</p>
            <div className={styles.social}>
              {site.social.map((s) => (
                <a key={s.label} href={s.href} target="_blank" rel="noreferrer" data-cursor="link">
                  {s.label}
                </a>
              ))}
            </div>
          </div>

          <form className={styles.form} onSubmit={onSubmit}>
            <div className={styles.row2}>
              <div className={styles.field}>
                <label htmlFor="name">{form.nameLabel}</label>
                <input id="name" name="name" type="text" required autoComplete="name" />
              </div>
              <div className={styles.field}>
                <label htmlFor="email">{form.emailLabel}</label>
                <input id="email" name="email" type="email" required autoComplete="email" />
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="company">{form.companyLabel}</label>
              <input id="company" name="company" type="text" autoComplete="organization" />
            </div>

            <div className={styles.row2}>
              <div className={styles.field}>
                <label htmlFor="projectType">{form.projectTypeLabel}</label>
                <select id="projectType" name="projectType" required defaultValue="">
                  <option value="" disabled>
                    {form.selectPlaceholder}
                  </option>
                  {form.projectTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label htmlFor="budget">{form.budgetLabel}</label>
                <select id="budget" name="budget" defaultValue="">
                  <option value="" disabled>
                    {form.selectPlaceholder}
                  </option>
                  {form.budgets.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="timeline">{form.timelineLabel}</label>
              <select id="timeline" name="timeline" defaultValue="">
                <option value="" disabled>
                  {form.selectPlaceholder}
                </option>
                {form.timelines.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="message">{form.messageLabel}</label>
              <textarea id="message" name="message" rows={4} required />
            </div>

            {/* Honeypot — hidden from real visitors, bots fill it in. */}
            <div className={styles.honeypot} aria-hidden="true">
              <label htmlFor="website">Website</label>
              <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
            </div>

            <Magnetic>
              <button type="submit" className={styles.submit} disabled={status === "sending"} data-cursor="link">
                {status === "sending" ? form.sendingButton : form.submitButton}
              </button>
            </Magnetic>

            {status === "sent" && <p className={`${styles.status} ${styles.statusOk}`}>{form.successMessage}</p>}
            {status === "error" && <p className={`${styles.status} ${styles.statusError}`}>{errorMsg}</p>}
          </form>
        </div>
      </div>
    </section>
  );
}
