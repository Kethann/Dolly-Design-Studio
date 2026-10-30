"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./portal.module.css";

const PASSWORD_MIN = 10;

type Step = "password" | "code" | "forgot" | "reset" | "mail" | "mailcode";

async function post(url: string, body: unknown) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
    const payload = await res.json().catch(() => null);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("The server returned an unexpected response. Please try again.");
    }
    const data = payload as { ok?: boolean; error?: string; needsCode?: boolean; challenge?: string; email?: string; resentIn?: number; restart?: boolean; emailEnabled?: boolean };
    if (typeof data.error !== "string") delete data.error;
    if (res.status === 403) data.error = "This sign-in request was blocked. Reload this page and try again using the same site address.";
    if (res.status === 429 && !data.error) data.error = "Too many attempts. Wait a few minutes before trying again.";
    if (res.ok && data.ok !== true && data.needsCode !== true) {
      throw new Error("The server could not confirm this request. Please try again.");
    }
    return { ok: res.ok, data };
  } catch (error) {
    if (controller.signal.aborted) throw new Error("The request took too long. Please check your connection and try again.");
    if (error instanceof TypeError) throw new Error("Couldn’t reach the server. Check your connection and try again.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Signing in: username and password; then, for people who turned on two-step sign-in, the code emailed to them.
 * "Forgot password" emails a code too, and the code plus a new password sets a new one.
 */
export function PortalLogin({ configured, setup = false, emailLogin = false }: { configured: boolean; setup?: boolean; emailLogin?: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("password");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [fresh, setFresh] = useState({ next: "", confirm: "" });
  /** "Email me a sign-in code": the address, then the code that was sent to it. */
  const [mailAddr, setMailAddr] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const inFlight = useRef(false);
  const [opening, startTransition] = useTransition();

  const go = (next: Step, message: string | null = null) => {
    setStep(next);
    setError(null);
    setCode("");
    setNotice(message);
    setShowPassword(false);
    setCapsLock(false);
    if (next !== "reset") setFresh({ next: "", confirm: "" });
  };

  async function run(fn: () => Promise<void>) {
    if (inFlight.current || opening) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Couldn’t reach the server. Check the connection and try again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const openPortal = () => startTransition(() => router.refresh());

  const signIn = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!username.trim() || !password) return;
    return run(async () => {
      const r = await post("/api/portal/session", { username: username.trim(), password });
      if (r.ok && r.data.needsCode) {
        if (!r.data.challenge || !r.data.email) throw new Error("Couldn’t start verification. Please try signing in again.");
        setChallenge(r.data.challenge);
        setSentTo(r.data.email);
        go("code", r.data.resentIn ? `A code was already sent. You can ask for a new one in ${r.data.resentIn} seconds.` : null);
        return;
      }
      if (r.ok) {
        openPortal();
        return;
      }
      setError(r.data.error ?? "Couldn’t sign in. Try again.");
    });
  };

  const verify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return;
    return run(async () => {
      const r = await post("/api/portal/session/verify", { challenge, code });
      if (r.ok) {
        openPortal();
        return;
      }
      if (r.data.restart) {
        setPassword("");
        setChallenge("");
        go("password");
      }
      setError(r.data.error ?? "That code didn’t work.");
    });
  };

  const sendReset = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!identifier.trim()) return;
    return run(async () => {
      const r = await post("/api/portal/reset/request", { identifier: identifier.trim() });
      if (!r.ok) {
        setError(r.data.error ?? "Couldn’t send the code. Try again.");
        return;
      }
      if (!r.data.emailEnabled) {
        setError("Email isn’t set up on this server yet, so codes can’t be sent. Ask an owner to set a new password for you in the portal.");
        return;
      }
      go("reset", "If that matches an account with an email address, a code is on its way. It lasts 10 minutes.");
    });
  };

  const confirmReset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code) || fresh.next.length < PASSWORD_MIN || fresh.next !== fresh.confirm) return;
    return run(async () => {
      const r = await post("/api/portal/reset/confirm", { identifier: identifier.trim(), code, password: fresh.next });
      if (!r.ok) {
        setError(r.data.error ?? "Couldn’t reset the password. Try again.");
        return;
      }
      setFresh({ next: "", confirm: "" });
      setPassword("");
      setUsername(identifier.trim());
      go("password", "Your password was changed, and every device was signed out. Sign in with the new one.");
    });
  };

  const sendMailCode = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailAddr.trim())) {
      setError("Enter a complete email address, such as name@example.com.");
      return;
    }
    return run(async () => {
      const r = await post("/api/portal/session/email", { email: mailAddr.trim() });
      if (!r.ok) {
        setError(r.data.error ?? "Couldn’t send the code. Try again.");
        return;
      }
      go("mailcode", "If that address can sign in here, a code is on its way. It lasts 10 minutes.");
    });
  };

  const verifyMailCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return;
    return run(async () => {
      const r = await post("/api/portal/session/email/verify", { email: mailAddr.trim(), code });
      if (r.ok) {
        openPortal();
        return;
      }
      if (r.data.restart) go("mail"); // (going back clears messages, so the reason is shown after it)
      setError(r.data.error ?? "That code didn’t work.");
    });
  };

  const mismatch = fresh.confirm.length > 0 && fresh.confirm !== fresh.next;
  const headings: Record<Step, [string, string]> = {
    password: ["Welcome back.", "Sign in to manage your studio’s work."],
    mail: ["Sign in with email.", "Get a one-time code instead of using a password."],
    mailcode: ["Check your inbox.", "Enter your code to open the creator portal."],
    code: ["One more step.", "Verify your sign-in with the code from your email."],
    forgot: ["Reset your password.", "We’ll help you get back to your workspace."],
    reset: ["A fresh start.", "Enter your email code and choose a new password."],
  };

  return (
    <main className={styles.loginShell}>
      <section className={styles.loginCard} aria-labelledby="login-title">
        <div className={styles.loginBrand}>
          <span className={styles.brandStar} aria-hidden="true">★</span>
          <span>Dolly Design Studio<small>Creator portal</small></span>
        </div>
        <header className={styles.loginHeading}>
          <h1 id="login-title" className={styles.loginTitle}>{configured ? headings[step][0] : "Portal unavailable"}</h1>
          <p className={styles.loginLead}>{configured ? headings[step][1] : "Please contact the studio owner to enable access."}</p>
        </header>

        <fieldset className={styles.loginFields} disabled={busy || opening} aria-label="Portal sign-in" aria-busy={busy || opening}>
          {opening && <p className={styles.loginNote} role="status">Opening your portal…</p>}
          {configured && notice && (
            <p className={styles.loginNote} role="status">
              {notice}
            </p>
          )}

          {configured && step === "password" && (
            <form onSubmit={signIn} className={styles.loginForm}>
              {setup && (
                <p className={styles.loginNote}>
                  First time here? Sign in as <code>admin</code> with the setup password, then create your own account.
                </p>
              )}
              <label htmlFor="portal-username" className={styles.controlLabel}>
                Username or email
              </label>
              <input
                id="portal-username"
                name="username"
                required
                type="text"
                className={styles.loginInput}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <label htmlFor="portal-password" className={styles.controlLabel}>
                Password
              </label>
              <div className={styles.passwordField}>
              <input
                id="portal-password"
                name="password"
                required
                type={showPassword ? "text" : "password"}
                className={styles.loginInput}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyUp={(e) => setCapsLock(e.getModifierState("CapsLock"))}
                onKeyDown={(e) => setCapsLock(e.getModifierState("CapsLock"))}
                onBlur={() => setCapsLock(false)}
                aria-describedby={capsLock ? "login-caps" : undefined}
              />
              <button type="button" className={styles.passwordToggle} aria-controls="portal-password" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? "Hide" : "Show"}</button>
              </div>
              {capsLock && <p id="login-caps" className={styles.loginHint} role="status">Caps Lock is on.</p>}
              {error && (
                <p className={styles.loginError} role="alert">
                  {error}
                </p>
              )}
              <button type="submit" className={styles.primaryButton} disabled={busy || !password || !username.trim()}>
                {busy ? "Signing in…" : "Sign in"}
              </button>
              {(!setup || emailLogin) && (
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => {
                    setIdentifier(username);
                    setNotice(null);
                    go("forgot");
                  }}
                >
                  Forgot your password?
                </button>
              )}
              {emailLogin && (
                <button
                  type="button"
                  className={styles.loginAlternative}
                  onClick={() => {
                    setMailAddr(username.includes("@") ? username.trim() : "");
                    setNotice(null);
                    go("mail");
                  }}
                >
                  Email me a sign-in code instead
                </button>
              )}
            </form>
          )}

          {configured && step === "mail" && (
            <form onSubmit={sendMailCode} className={styles.loginForm}>
              <p className={styles.loginLead}>Type the email address of your account (or the studio’s own address). We’ll send a 6-digit code to it: no password needed.</p>
              <label htmlFor="portal-mail" className={styles.controlLabel}>
                Email address
              </label>
              <input
                id="portal-mail"
                name="email"
                required
                type="email"
                className={styles.loginInput}
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                value={mailAddr}
                onChange={(e) => setMailAddr(e.target.value)}
              />
              {error && (
                <p className={styles.loginError} role="alert">
                  {error}
                </p>
              )}
              <button type="submit" className={styles.primaryButton} disabled={busy || !mailAddr.includes("@")}>
                {busy ? "Sending…" : "Send me a code"}
              </button>
              <button type="button" className={styles.linkButton} onClick={() => go("password")}>
                Back to the password
              </button>
            </form>
          )}

          {configured && step === "mailcode" && (
            <form onSubmit={verifyMailCode} className={styles.loginForm}>
              <p className={styles.loginLead}>
                Type the 6-digit code we sent to <strong>{mailAddr}</strong>.
              </p>
              <label htmlFor="portal-mailcode" className={styles.controlLabel}>
                Code
              </label>
              <input
                id="portal-mailcode"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                className={`${styles.loginInput} ${styles.codeInput}`}
                autoComplete="one-time-code"
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
              {error && (
                <p className={styles.loginError} role="alert">
                  {error}
                </p>
              )}
              <button type="submit" className={styles.primaryButton} disabled={busy || code.replace(/\s/g, "").length < 6}>
                {busy ? "Checking…" : "Sign in"}
              </button>
              <button type="button" className={styles.linkButton} onClick={() => go("mail")}>
                Send a new code
              </button>
            </form>
          )}

          {configured && step === "code" && (
            <form onSubmit={verify} className={styles.loginForm}>
              <p className={styles.loginLead}>
                We emailed a 6-digit code to <strong>{sentTo}</strong>. Type it below to finish signing in.
              </p>
              <label htmlFor="portal-code" className={styles.controlLabel}>
                Code
              </label>
              <input
                id="portal-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                className={`${styles.loginInput} ${styles.codeInput}`}
                autoComplete="one-time-code"
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
              {error && (
                <p className={styles.loginError} role="alert">
                  {error}
                </p>
              )}
              <button type="submit" className={styles.primaryButton} disabled={busy || code.replace(/\s/g, "").length < 6}>
                {busy ? "Checking…" : "Sign in"}
              </button>
              <div className={styles.loginLinks}>
                <button type="button" className={styles.linkButton} disabled={busy} onClick={() => signIn()}>
                  Send a new code
                </button>
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => {
                    setNotice(null);
                    setPassword("");
                    go("password");
                  }}
                >
                  Back
                </button>
              </div>
            </form>
          )}

          {configured && step === "forgot" && (
            <form onSubmit={sendReset} className={styles.loginForm}>
              <p className={styles.loginLead}>Enter your username or email address. We’ll email you a code to choose a new password.</p>
              <label htmlFor="portal-identifier" className={styles.controlLabel}>
                Username or email
              </label>
              <input
                id="portal-identifier"
                name="username"
                autoComplete="username"
                required
                type="text"
                className={styles.loginInput}
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
              />
              {error && (
                <p className={styles.loginError} role="alert">
                  {error}
                </p>
              )}
              <button type="submit" className={styles.primaryButton} disabled={busy || !identifier.trim()}>
                {busy ? "Sending…" : "Email me a code"}
              </button>
              <button type="button" className={styles.linkButton} onClick={() => go("password")}>
                Back to sign in
              </button>
            </form>
          )}

          {configured && step === "reset" && (
            <form onSubmit={confirmReset} className={styles.loginForm}>
              <label htmlFor="reset-code" className={styles.controlLabel}>
                Code from the email
              </label>
              <input
                id="reset-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                className={`${styles.loginInput} ${styles.codeInput}`}
                autoComplete="one-time-code"
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
              <label htmlFor="reset-new" className={styles.controlLabel}>
                New password
              </label>
              <input
                id="reset-new"
                name="new-password"
                required
                minLength={PASSWORD_MIN}
                type={showPassword ? "text" : "password"}
                className={styles.loginInput}
                autoComplete="new-password"
                value={fresh.next}
                onChange={(e) => setFresh({ ...fresh, next: e.target.value })}
              />
              <small className={styles.loginHint}>At least {PASSWORD_MIN} characters. A short sentence is easy to remember and hard to guess.</small>
              <label htmlFor="reset-confirm" className={styles.controlLabel}>
                Repeat new password
              </label>
              <input
                id="reset-confirm"
                name="confirm-password"
                required
                type={showPassword ? "text" : "password"}
                className={styles.loginInput}
                autoComplete="new-password"
                value={fresh.confirm}
                onChange={(e) => setFresh({ ...fresh, confirm: e.target.value })}
                aria-invalid={mismatch}
                aria-describedby={mismatch ? "reset-mismatch" : undefined}
              />
              <button type="button" className={styles.linkButton} aria-controls="reset-new reset-confirm" aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? "Hide passwords" : "Show passwords"}</button>
              {mismatch && <p id="reset-mismatch" className={styles.loginError}>The passwords don’t match.</p>}
              {error && (
                <p className={styles.loginError} role="alert">
                  {error}
                </p>
              )}
              <button
                type="submit"
                className={styles.primaryButton}
                disabled={busy || code.replace(/\s/g, "").length < 6 || fresh.next.length < PASSWORD_MIN || fresh.next !== fresh.confirm}
              >
                {busy ? "Saving…" : "Set new password"}
              </button>
              <div className={styles.loginLinks}>
                <button type="button" className={styles.linkButton} disabled={busy} onClick={() => sendReset()}>
                  Send the code again
                </button>
                <button type="button" className={styles.linkButton} onClick={() => go("password")}>
                  Back to sign in
                </button>
              </div>
            </form>
          )}
        </fieldset>
        <footer className={styles.loginFooter}><Link href="/" prefetch={false}>← Back to the studio</Link><span>For the people behind the work.</span></footer>
      </section>
    </main>
  );
}
