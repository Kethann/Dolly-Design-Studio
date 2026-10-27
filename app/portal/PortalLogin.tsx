"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./portal.module.css";

export function PortalLogin({ configured, setup = false }: { configured: boolean; setup?: boolean }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        router.refresh();
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn’t sign in. Try again.");
    } catch {
      setError("Couldn’t reach the server. Check the connection and try again.");
    }
    setBusy(false);
  }

  return (
    <div className={styles.loginShell}>
      <form className={styles.loginCard} onSubmit={submit}>
        <span className={styles.brandStar} aria-hidden="true">
          ★
        </span>
        <h1 className={styles.loginTitle}>Creator portal</h1>
        <p className={styles.loginLead}>Dolly Design Studio</p>
        {configured && setup && (
          <p className={styles.loginNote}>
            First time here? Sign in as <code>admin</code> with the setup password, then create your own account.
          </p>
        )}
        {configured ? (
          <>
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
          </>
        ) : (
          <p className={styles.loginLead}>
            The portal isn’t switched on yet. Add <code>PORTAL_PASSWORD</code> to the server’s environment (locally, in{" "}
            <code>.env.local</code>) and restart it.
          </p>
        )}
      </form>
    </div>
  );
}
