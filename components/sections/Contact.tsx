"use client";

import { useRef, useState } from "react";
import { useContent, tx } from "@/lib/content/context";
import { edSection } from "@/lib/content/tx";
import { Magnetic } from "@/components/Magnetic";
import { CONTACT_LIMITS, validateContact, type ContactErrors, type ContactField } from "@/lib/contact/validate";
import { renderFx } from "@/components/fx/render-fx";
import styles from "./Contact.module.css";

type Status = "idle" | "sending" | "sent" | "error";

export function Contact() {
  const { site, home } = useContent();
  const copy = home.contact;
  const form = copy.form;
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  /** What is wrong with each field, shown beside it. A field is only checked once it has been left, or on sending. */
  const [fieldErrors, setFieldErrors] = useState<ContactErrors>({});
  const [chars, setChars] = useState(0);
  const touched = useRef(new Set<ContactField>());
  const [flakes, setFlakes] = useState<{ id: number; left: number; delay: number }[]>([]);

  /** Checks the form as it stands; only the fields in `which` have their message shown. */
  function check(formEl: HTMLFormElement, which: Iterable<ContactField>) {
    const { errors } = validateContact(Object.fromEntries(new FormData(formEl).entries()));
    const shown = new Set(which);
    setFieldErrors(Object.fromEntries(Object.entries(errors).filter(([k]) => shown.has(k as ContactField))) as ContactErrors);
    return errors;
  }

  function onLeave(e: React.FocusEvent<HTMLFormElement>) {
    const name = (e.target as unknown as HTMLInputElement).name as ContactField;
    if (!name || name === ("website" as string)) return;
    touched.current.add(name);
    check(e.currentTarget, touched.current);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "sending") return;
    const formEl = e.currentTarget;
    const data = Object.fromEntries(new FormData(formEl).entries());
    setErrorMsg("");

    const problems = validateContact(data).errors;
    const keys = Object.keys(problems) as ContactField[];
    keys.forEach((k) => touched.current.add(k));
    check(formEl, [...touched.current, ...keys]);
    if (keys.length) {
      setStatus("error");
      setErrorMsg(form.errors.missingFields);
      formEl.querySelector<HTMLElement>(`[name="${keys[0]}"]`)?.focus();
      return;
    }

    setStatus("sending");
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 20_000);
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        signal: ctl.signal,
      }).finally(() => clearTimeout(timer));
      const json = (await res.json().catch(() => ({}))) as { error?: string; fields?: ContactErrors };
      if (!res.ok) {
        if (json.fields) {
          setFieldErrors(json.fields);
          formEl.querySelector<HTMLElement>(`[name="${Object.keys(json.fields)[0]}"]`)?.focus();
        }
        throw new Error(json.error || form.errors.generic);
      }
      setStatus("sent");
      setFlakes(
        Array.from({ length: 24 }, (_, i) => ({ id: i, left: Math.random() * 100, delay: Math.random() * 0.6 })),
      );
      formEl.reset();
      touched.current.clear();
      setFieldErrors({});
      setChars(0);
    } catch (err) {
      setStatus("error");
      setErrorMsg(
        err instanceof DOMException && err.name === "AbortError"
          ? "This is taking too long. Check your connection and try again."
          : err instanceof TypeError
            ? "Couldn’t reach the server. Check your connection and try again."
            : err instanceof Error
              ? err.message
              : form.errors.generic,
      );
    }
  }

  /** The attributes that tie a field to its error message for screen readers. */
  const bad = (f: ContactField) => ({ "aria-invalid": fieldErrors[f] ? true : undefined, "aria-describedby": fieldErrors[f] ? `err-${f}` : undefined });
  const err = (f: ContactField) =>
    fieldErrors[f] ? (
      <p id={`err-${f}`} className={styles.fieldError} role="alert">
        {fieldErrors[f]}
      </p>
    ) : null;

  return (
    <section id="contact" className={styles.section} {...edSection("home", "contact", "Contact us")}>
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
        <h2 className={styles.headline} {...tx("home.contact.headline")}>{renderFx(copy.headline)}</h2>
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

          <form className={styles.form} onSubmit={onSubmit} onBlur={onLeave} noValidate>
            <div className={styles.row2}>
              <div className={styles.field}>
                <label htmlFor="name">{form.nameLabel}</label>
                <input id="name" name="name" type="text" required autoComplete="name" maxLength={CONTACT_LIMITS.nameMax} {...bad("name")} />
                {err("name")}
              </div>
              <div className={styles.field}>
                <label htmlFor="email">{form.emailLabel}</label>
                <input id="email" name="email" type="email" required autoComplete="email" maxLength={CONTACT_LIMITS.emailMax} {...bad("email")} />
                {err("email")}
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="phone">{form.phoneLabel}</label>
              <input id="phone" name="phone" type="tel" inputMode="tel" required autoComplete="tel" placeholder="+91 98765 43210" maxLength={24} {...bad("phone")} />
              {err("phone")}
            </div>

            <div className={styles.field}>
              <label htmlFor="company">{form.companyLabel}</label>
              <input id="company" name="company" type="text" autoComplete="organization" />
            </div>

            <div className={styles.row2}>
              <div className={styles.field}>
                <label htmlFor="projectType">{form.projectTypeLabel}</label>
                <select id="projectType" name="projectType" required defaultValue="" {...bad("projectType")}>
                  <option value="" disabled>
                    {form.selectPlaceholder}
                  </option>
                  {form.projectTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                {err("projectType")}
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
              <textarea
                id="message"
                name="message"
                rows={5}
                required
                maxLength={CONTACT_LIMITS.messageMax}
                placeholder={form.messagePlaceholder}
                onChange={(e) => setChars(e.target.value.length)}
                {...bad("message")}
              />
              <div className={styles.fieldMeta}>
                {err("message") ?? <span />}
                <span className={styles.counter} data-low={chars > 0 && chars < CONTACT_LIMITS.messageMin}>
                  {chars} / {CONTACT_LIMITS.messageMax}
                </span>
              </div>
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

            <div aria-live="polite">
              {status === "sent" && <p className={`${styles.status} ${styles.statusOk}`}>{form.successMessage}</p>}
              {status === "error" && <p className={`${styles.status} ${styles.statusError}`}>{errorMsg}</p>}
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
