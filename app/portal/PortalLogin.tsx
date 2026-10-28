"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./portal.module.css";

const PASSWORD_MIN = 10;

type Step = "password" | "code" | "forgot" | "reset";

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/**
 * Signing in: username and password; then, for people who turned on two-step sign-in, the code emailed to them.
 * "Forgot password" emails a code too, and the code plus a new password sets a new one.
 */
export function PortalLogin({ configured, setup = false }: { configured: boolean; setup?: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("password");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [fresh, setFresh] = useState({ next: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const go = (next: Step) => {
    setStep(next);
    setError(null);
    setCode("");
  };

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch {
      setError("Couldn’t reach the server. Check the connection and try again.");
    }
    setBusy(false);
  }

  const signIn = (e?: React.FormEvent) => {
    e?.preventDefault();
    return run(async () => {
      const r = await post("/api/portal/session", { username, password });
      if (r.ok && r.data.needsCode) {
        setChallenge(r.data.challenge);
        setSentTo(r.data.email);
        setNotice(r.data.resentIn ? `A code was already sent. You can ask for a new one in ${r.data.resentIn} seconds.` : null);
        go("code");
        return;
      }
      if (r.ok) {
        router.refresh();
        return;
      }
      setError(r.data.error ?? "Couldn’t sign in. Try again.");
    });
  };

  const verify = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const r = await post("/api/portal/session/verify", { challenge, code });
      if (r.ok) {
        router.refresh();
        return;
      }
      setError(r.data.error ?? "That code didn’t work.");
      if (r.data.restart) {
        setPassword("");
        setStep("password");
      }
    });
  };

  const sendReset = (e?: React.FormEvent) => {
    e?.preventDefault();
    return run(async () => {
      const r = await post("/api/portal/reset/request", { identifier });
      if (!r.ok) {
        setError(r.data.error ?? "Couldn’t send the code. Try again.");
        return;
      }
      if (!r.data.emailEnabled) {
        setError("Email isn’t set up on this server yet, so codes can’t be sent. Ask an owner to set a new password for you in the portal.");
        return;
      }
      setNotice("If that matches an account with an email address, a code is on its way. It lasts 10 minutes.");
      go("reset");
    });
  };

  const confirmReset = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const r = await post("/api/portal/reset/confirm", { identifier, code, password: fresh.next });
      if (!r.ok) {
        setError(r.data.error ?? "Couldn’t reset the password. Try again.");
        return;
      }
      setFresh({ next: "", confirm: "" });
      setPassword("");
      setUsername(identifier.includes("@") ? "" : identifier);
      setNotice("Your password was changed, and every device was signed out. Sign in with the new one.");
      go("password");
    });
  };

  const mismatch = fresh.confirm.length > 0 && fresh.confirm !== fresh.next;

  return (
    <div className={styles.loginShell}>
      <div className={styles.loginCard}>
        <span className={styles.brandStar} aria-hidden="true">
          ★
        </span>
        <h1 className={styles.loginTitle}>Creator portal</h1>
        <p className={styles.loginLead}>Dolly Design Studio</p>

        {!configured && (
          <p className={styles.loginLead}>
            The portal isn’t switched on yet. Add <code>PORTAL_PASSWORD</code> to the server’s environment (locally, in <code>.env.local</code>) and
            restart it.
          </p>
        )}

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
              Username
            </label>
            <input
              id="portal-username"
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
            <input
              id="portal-password"
              type="password"
              className={styles.loginInput}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && (
              <p className={styles.loginError} role="alert">
                {error}
              </p>
            )}
            <button type="submit" className={styles.primaryButton} disabled={busy || !password || !username}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
            {!setup && (
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
              pattern="[0-9 ]*"
              maxLength={7}
              className={`${styles.loginInput} ${styles.codeInput}`}
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9 ]/g, ""))}
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
              maxLength={7}
              className={`${styles.loginInput} ${styles.codeInput}`}
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9 ]/g, ""))}
            />
            <label htmlFor="reset-new" className={styles.controlLabel}>
              New password
            </label>
            <input
              id="reset-new"
              type="password"
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
              type="password"
              className={styles.loginInput}
              autoComplete="new-password"
              value={fresh.confirm}
              onChange={(e) => setFresh({ ...fresh, confirm: e.target.value })}
            />
            {mismatch && <p className={styles.loginError}>The passwords don’t match.</p>}
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
      </div>
    </div>
  );
}
