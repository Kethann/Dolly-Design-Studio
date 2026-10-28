"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PortalUser, Role } from "@/lib/portal/users";
import styles from "./portal.module.css";

const PASSWORD_MIN = 10;

type Status = { kind: "idle" } | { kind: "busy" } | { kind: "ok"; message: string } | { kind: "error"; message: string };

async function call(method: string, body?: unknown) {
  const res = await fetch("/api/portal/users", {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong. Try again.");
  return data;
}

/** Your own sign-in details: username, email, two-step sign-in, signing out everywhere. */
async function account(body: unknown) {
  const res = await fetch("/api/portal/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong. Try again.");
  return data;
}

const when = (iso?: string) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "never";

/** Users & security: your own account and password, and (for owners) everyone who can use the portal. */
export function AccountPanel({ me }: { me: PortalUser }) {
  const router = useRouter();
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const refresh = useCallback(() => {
    call("GET")
      .then((d) => setUsers(d.users ?? []))
      .catch(() => {});
  }, []);
  useEffect(refresh, [refresh]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setStatus({ kind: "busy" });
    try {
      await fn();
      setStatus({ kind: "ok", message: ok });
      refresh();
      router.refresh(); // your own name, username and email as the portal shows them
      return true;
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : "Something went wrong." });
      return false;
    }
  };

  const owner = me.role === "owner";
  return (
    <div className={styles.account}>
      <header className={styles.accountHead}>
        <h2>People &amp; passwords</h2>
        <p>Your sign-in details, and (for owners) everyone who can open this portal.</p>
      </header>

      {status.kind === "ok" && (
        <p className={styles.notice} data-kind="ok" role="status">
          {status.message}
        </p>
      )}
      {status.kind === "error" && (
        <p className={styles.notice} data-kind="error" role="alert">
          {status.message}
        </p>
      )}

      {me.setup ? (
        <SetupCard
          onCreate={(u) => run(() => call("POST", { ...u, role: "owner" }), "Owner account created. Sign in with it now.")}
        />
      ) : (
        <>
          <MyAccount me={me} run={run} />
          {owner && <EmailSetup me={me} />}
          {owner && <Team me={me} users={users} run={run} />}
          <SecurityNotes />
        </>
      )}
    </div>
  );
}

function SetupCard({ onCreate }: { onCreate: (u: { username: string; name: string; password: string }) => Promise<boolean> }) {
  const [form, setForm] = useState({ name: "", username: "", password: "", confirm: "" });
  const [done, setDone] = useState(false);
  const mismatch = form.confirm.length > 0 && form.confirm !== form.password;
  return (
    <section className={styles.card}>
      <h3>Create your owner account</h3>
      <p className={styles.controlHint}>
        You’re signed in with the temporary setup password. Create your own account: once it exists, the setup password stops
        working, and you’ll sign in with your new username and password.
      </p>
      {done ? (
        <button type="button" className={styles.primaryButton} onClick={() => window.location.reload()}>
          Sign in with your new account
        </button>
      ) : (
        <form
          className={styles.formGrid}
          onSubmit={async (e) => {
            e.preventDefault();
            if (await onCreate(form)) setDone(true);
          }}
        >
          <Field label="Your name" value={form.name} onChange={(name) => setForm({ ...form, name })} autoComplete="name" />
          <Field
            label="Username"
            value={form.username}
            onChange={(username) => setForm({ ...form, username })}
            autoComplete="username"
          />
          <Field
            label="Password"
            type="password"
            value={form.password}
            onChange={(password) => setForm({ ...form, password })}
            autoComplete="new-password"
            hint={`At least ${PASSWORD_MIN} characters.`}
          />
          <Field
            label="Repeat password"
            type="password"
            value={form.confirm}
            onChange={(confirm) => setForm({ ...form, confirm })}
            autoComplete="new-password"
            error={mismatch ? "The passwords don’t match." : undefined}
          />
          <button
            type="submit"
            className={styles.primaryButton}
            disabled={!form.username || form.password.length < PASSWORD_MIN || form.password !== form.confirm}
          >
            Create owner account
          </button>
        </form>
      )}
    </section>
  );
}

type Run = (fn: () => Promise<unknown>, ok: string) => Promise<boolean>;

function MyAccount({ me, run }: { me: PortalUser; run: Run }) {
  const [name, setName] = useState(me.name);
  return (
    <>
      <section className={styles.card}>
        <h3>Your account</h3>
        <dl className={styles.facts}>
          <dt>Username</dt>
          <dd>{me.username}</dd>
          <dt>Email</dt>
          <dd>{me.email ?? "none yet"}</dd>
          <dt>Role</dt>
          <dd>
            <RoleBadge role={me.role} />
          </dd>
          <dt>Two-step sign-in</dt>
          <dd>{me.twoFactor ? "On — a code is emailed each time" : "Off"}</dd>
          <dt>Last sign-in</dt>
          <dd>{when(me.lastSignIn)}</dd>
        </dl>
        <form
          className={styles.formRow}
          onSubmit={(e) => {
            e.preventDefault();
            run(() => call("PATCH", { id: me.id, name }), "Name saved.");
          }}
        >
          <Field label="Display name" value={name} onChange={setName} autoComplete="name" />
          <button type="submit" className={styles.ghostButton} disabled={!name.trim() || name === me.name}>
            Save name
          </button>
        </form>
      </section>

      <UsernameCard me={me} run={run} />
      <EmailCard me={me} run={run} />
      <TwoStepCard me={me} run={run} />
      <PasswordCard me={me} run={run} />
      <SignOutCard run={run} />
    </>
  );
}

function UsernameCard({ me, run }: { me: PortalUser; run: Run }) {
  const [form, setForm] = useState({ username: "", current: "" });
  return (
    <section className={styles.card}>
      <h3>Change your username</h3>
      <p className={styles.controlHint}>You’ll sign in with the new username from now on. Your other details stay the same.</p>
      <form
        className={styles.formGrid}
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => account({ action: "username", username: form.username, currentPassword: form.current }), "Username changed.")) {
            setForm({ username: "", current: "" });
          }
        }}
      >
        <Field label="New username" value={form.username} onChange={(username) => setForm({ ...form, username })} autoComplete="username" hint="3–32 letters, numbers, dots, dashes or underscores." />
        <Field label="Current password" type="password" value={form.current} onChange={(current) => setForm({ ...form, current })} autoComplete="current-password" />
        <button type="submit" className={styles.ghostButton} disabled={form.username.trim().length < 3 || !form.current}>
          Change username
        </button>
      </form>
    </section>
  );
}

/** Add or change the email address: a code is sent to the new address and must be typed in, so a typo can't lock anyone out. */
function EmailCard({ me, run }: { me: PortalUser; run: Run }) {
  const [form, setForm] = useState({ email: "", current: "", code: "" });
  const [sentTo, setSentTo] = useState<string | null>(null);
  return (
    <section className={styles.card}>
      <h3>Email address</h3>
      <p className={styles.controlHint}>
        Used to send you codes: to reset a forgotten password, and for two-step sign-in.{" "}
        {me.email ? (
          <>
            Now: <strong>{me.email}</strong>.
          </>
        ) : (
          "You haven’t added one yet."
        )}
      </p>
      {sentTo ? (
        <form
          className={styles.formGrid}
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(() => account({ action: "email-verify", code: form.code }), "Email address confirmed.")) {
              setSentTo(null);
              setForm({ email: "", current: "", code: "" });
            }
          }}
        >
          <p className={styles.controlHint}>
            We sent a 6-digit code to <strong>{sentTo}</strong>. It lasts 10 minutes.
          </p>
          <Field label="Code from the email" value={form.code} onChange={(code) => setForm({ ...form, code: code.replace(/[^0-9 ]/g, "") })} autoComplete="one-time-code" />
          <div className={styles.formRow}>
            <button type="submit" className={styles.primaryButton} disabled={form.code.replace(/\s/g, "").length < 6}>
              Confirm
            </button>
            <button type="button" className={styles.linkButton} onClick={() => setSentTo(null)}>
              Use a different address
            </button>
          </div>
        </form>
      ) : (
        <form
          className={styles.formGrid}
          onSubmit={async (e) => {
            e.preventDefault();
            let masked = "";
            const ok = await run(async () => {
              const r = await account({ action: "email-code", email: form.email, currentPassword: form.current });
              masked = r.sentTo;
            }, "Code sent. Check your email.");
            if (ok) setSentTo(masked);
          }}
        >
          <Field label={me.email ? "New email address" : "Email address"} value={form.email} onChange={(email) => setForm({ ...form, email })} autoComplete="email" />
          <Field label="Current password" type="password" value={form.current} onChange={(current) => setForm({ ...form, current })} autoComplete="current-password" />
          <div className={styles.formRow}>
            <button type="submit" className={styles.ghostButton} disabled={!form.email.includes("@") || !form.current}>
              {me.email ? "Send a code to the new address" : "Send me a code"}
            </button>
            {me.email && (
              <button
                type="button"
                className={styles.dangerButton}
                disabled={!form.current}
                title={form.current ? "" : "Type your current password above first"}
                onClick={() => {
                  if (window.confirm("Remove your email address? Two-step sign-in and email password reset will stop working for you.")) {
                    run(() => account({ action: "email-remove", currentPassword: form.current }), "Email address removed.");
                  }
                }}
              >
                Remove
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

function TwoStepCard({ me, run }: { me: PortalUser; run: Run }) {
  const [current, setCurrent] = useState("");
  return (
    <section className={styles.card}>
      <h3>Two-step sign-in</h3>
      <p className={styles.controlHint}>
        After your password, a 6-digit code is emailed to <strong>{me.email ?? "your email address"}</strong>, so a stolen password alone can’t open the portal.
        {!me.email && " Add and confirm your email address first."}
      </p>
      <form
        className={styles.formRow}
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => account({ action: "two-factor", enabled: !me.twoFactor, currentPassword: current }), me.twoFactor ? "Two-step sign-in is off." : "Two-step sign-in is on.")) setCurrent("");
        }}
      >
        <Field label="Current password" type="password" value={current} onChange={setCurrent} autoComplete="current-password" />
        <button type="submit" className={me.twoFactor ? styles.dangerButton : styles.primaryButton} disabled={!current || (!me.twoFactor && !me.email)}>
          {me.twoFactor ? "Turn off" : "Turn on"}
        </button>
      </form>
    </section>
  );
}

function PasswordCard({ me, run }: { me: PortalUser; run: Run }) {
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const mismatch = pw.confirm.length > 0 && pw.confirm !== pw.next;
  return (
    <section className={styles.card}>
      <h3>Change your password</h3>
      <p className={styles.controlHint}>Forgot it instead? On the sign-in page choose “Forgot your password?” and a code is emailed to you.</p>
      <form
        className={styles.formGrid}
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await run(
            () => call("PATCH", { id: me.id, currentPassword: pw.current, password: pw.next }),
            "Password changed. Your other devices have been signed out.",
          );
          if (ok) setPw({ current: "", next: "", confirm: "" });
        }}
      >
        <Field label="Current password" type="password" value={pw.current} onChange={(current) => setPw({ ...pw, current })} autoComplete="current-password" />
        <Field
          label="New password"
          type="password"
          value={pw.next}
          onChange={(next) => setPw({ ...pw, next })}
          autoComplete="new-password"
          hint={`At least ${PASSWORD_MIN} characters. A short sentence is easy to remember and hard to guess.`}
        />
        <Field
          label="Repeat new password"
          type="password"
          value={pw.confirm}
          onChange={(confirm) => setPw({ ...pw, confirm })}
          autoComplete="new-password"
          error={mismatch ? "The passwords don’t match." : undefined}
        />
        <button type="submit" className={styles.primaryButton} disabled={!pw.current || pw.next.length < PASSWORD_MIN || pw.next !== pw.confirm}>
          Change password
        </button>
      </form>
    </section>
  );
}

function SignOutCard({ run }: { run: Run }) {
  const [current, setCurrent] = useState("");
  return (
    <section className={styles.card}>
      <h3>Sign out everywhere else</h3>
      <p className={styles.controlHint}>Lost a laptop, or signed in on a computer that isn’t yours? This signs you out of every other device. This one stays signed in.</p>
      <form
        className={styles.formRow}
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => account({ action: "sign-out-everywhere", currentPassword: current }), "All your other devices were signed out.")) setCurrent("");
        }}
      >
        <Field label="Current password" type="password" value={current} onChange={setCurrent} autoComplete="current-password" />
        <button type="submit" className={styles.ghostButton} disabled={!current}>
          Sign out other devices
        </button>
      </form>
    </section>
  );
}

/** Owners: whether email is connected, how to connect it, and a button that proves it works. */
function EmailSetup({ me }: { me: PortalUser }) {
  const [info, setInfo] = useState<{ configured: boolean; label: string | null; from: string | null; account: string | null; port: number | null } | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/portal/mail")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setInfo(d))
      .catch(() => {});
  }, []);
  async function test() {
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch("/api/portal/mail", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      setResult(r.ok ? { ok: true, message: `Sent. Check the inbox of ${d.sentTo}.` } : { ok: false, message: d.error ?? "Couldn’t send." });
    } catch {
      setResult({ ok: false, message: "Couldn’t reach the server." });
    }
    setBusy(false);
  }
  return (
    <section className={styles.card}>
      <div className={styles.cardHead}>
        <h3>Email &amp; codes</h3>
        <span className={styles.roleBadge} data-role={info?.configured ? "owner" : "editor"}>
          {info === null ? "Checking…" : info.configured ? "Connected" : "Not connected"}
        </span>
      </div>
      {info?.configured ? (
        <>
          <dl className={styles.facts}>
            <dt>Sent through</dt>
            <dd>
              {info.label}
              {info.port ? ` (port ${info.port})` : ""}
            </dd>
            <dt>Sent from</dt>
            <dd>{info.from}</dd>
            {info.account && (
              <>
                <dt>Account</dt>
                <dd>{info.account}</dd>
              </>
            )}
          </dl>
          <div className={styles.formRow}>
            <button type="button" className={styles.ghostButton} disabled={busy || !me.email} onClick={test}>
              {busy ? "Sending…" : "Send me a test email"}
            </button>
            {!me.email && <small className={styles.controlHint}>Add your own email address above first; the test goes there.</small>}
          </div>
          {result && (
            <p className={styles.notice} data-kind={result.ok ? "ok" : "error"} role="status">
              {result.message}
            </p>
          )}
        </>
      ) : (
        <>
          <p className={styles.controlHint}>
            Email isn’t connected yet, so forgot-password and two-step codes can’t be sent. To connect a Gmail account, open the file <code>.env.local</code> (in the
            site’s folder) and add these two lines, then restart the site:
          </p>
          <pre className={styles.codeBlock}>{`GMAIL_USER=your.address@gmail.com
GMAIL_APP_PASSWORD=abcd efgh ijkl mnop`}</pre>
          <p className={styles.controlHint}>
            The password is a Google <strong>app password</strong> (not your normal one): Google account → Security → 2-Step Verification → App passwords. For another
            email service use <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code> and <code>SMTP_FROM</code> instead. On a live server, add the same names in
            the host’s environment settings.
          </p>
        </>
      )}
    </section>
  );
}

function Team({
  me,
  users,
  run,
}: {
  me: PortalUser;
  users: PortalUser[];
  run: (fn: () => Promise<unknown>, ok: string) => Promise<boolean>;
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", username: "", email: "", password: "", role: "editor" as Role });
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState("");

  return (
    <section className={styles.card}>
      <div className={styles.cardHead}>
        <h3>People ({users.length})</h3>
        <button type="button" className={styles.ghostButton} onClick={() => setAdding((a) => !a)}>
          {adding ? "Cancel" : "+ Add a person"}
        </button>
      </div>
      <p className={styles.controlHint}>
        <strong>Owners</strong> can change everything, including who has access. <strong>Editors</strong> can design and publish
        the site, and change only their own password.
      </p>

      {adding && (
        <form
          className={styles.formGrid}
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(() => call("POST", form), `${form.username} can now sign in.`)) {
              setForm({ name: "", username: "", email: "", password: "", role: "editor" });
              setAdding(false);
            }
          }}
        >
          <Field label="Name" value={form.name} onChange={(name) => setForm({ ...form, name })} />
          <Field label="Username" value={form.username} onChange={(username) => setForm({ ...form, username })} />
          <Field label="Email (optional)" value={form.email} onChange={(email) => setForm({ ...form, email })} autoComplete="off" hint="Where their reset and sign-in codes go. They can change it later." />
          <Field
            label="Temporary password"
            type="text"
            value={form.password}
            onChange={(password) => setForm({ ...form, password })}
            hint="Share it privately; they can change it after signing in."
          />
          <label className={styles.field}>
            <span>Role</span>
            <select
              className={styles.select}
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
            >
              <option value="editor">Editor</option>
              <option value="owner">Owner</option>
            </select>
          </label>
          <button type="submit" className={styles.primaryButton} disabled={!form.username || form.password.length < PASSWORD_MIN}>
            Add person
          </button>
        </form>
      )}

      <ul className={styles.people}>
        {users.map((u) => (
          <li key={u.id} className={styles.person}>
            <div className={styles.personMain}>
              <span className={styles.avatar} aria-hidden="true">
                {(u.name || u.username).slice(0, 1).toUpperCase()}
              </span>
              <span>
                <strong>{u.name}</strong>
                {u.id === me.id && <span className={styles.you}>you</span>}
                <br />
                <small>
                  {u.username}
                  {u.email ? ` · ${u.email}` : " · no email"}
                  {u.twoFactor ? " · two-step" : ""} · last sign-in {when(u.lastSignIn)}
                </small>
              </span>
            </div>
            <div className={styles.personActions}>
              {u.id === me.id ? (
                <RoleBadge role={u.role} />
              ) : (
                <>
                  <select
                    className={styles.select}
                    aria-label={`Role for ${u.username}`}
                    value={u.role}
                    onChange={(e) =>
                      run(() => call("PATCH", { id: u.id, role: e.target.value }), `${u.username} is now an ${e.target.value}.`)
                    }
                  >
                    <option value="editor">Editor</option>
                    <option value="owner">Owner</option>
                  </select>
                  <button
                    type="button"
                    className={styles.linkButton}
                    onClick={() => setResetFor(resetFor === u.id ? null : u.id)}
                  >
                    Reset password
                  </button>
                  <button
                    type="button"
                    className={styles.dangerButton}
                    onClick={() => {
                      if (window.confirm(`Remove ${u.name} (${u.username})? They’ll be signed out at once.`)) {
                        run(() => call("DELETE", { id: u.id }), `${u.username} was removed.`);
                      }
                    }}
                  >
                    Remove
                  </button>
                </>
              )}
            </div>
            {resetFor === u.id && (
              <form
                className={styles.formRow}
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (
                    await run(
                      () => call("PATCH", { id: u.id, password: resetPw }),
                      `New password set for ${u.username}; they’ve been signed out.`,
                    )
                  ) {
                    setResetFor(null);
                    setResetPw("");
                  }
                }}
              >
                <Field label="New temporary password" type="text" value={resetPw} onChange={setResetPw} />
                <button type="submit" className={styles.ghostButton} disabled={resetPw.length < PASSWORD_MIN}>
                  Set password
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SecurityNotes() {
  return (
    <section className={styles.card}>
      <h3>How the portal is protected</h3>
      <ul className={styles.checks}>
        <li>Passwords are stored only as salted scrypt hashes, in a private file that is never pushed to Git.</li>
        <li>
          Sessions last 12 hours and are signed by the server. Changing a password or removing someone ends their sessions at
          once.
        </li>
        <li>Sign-in attempts are limited per address and per username, so passwords can’t be guessed.</li>
        <li>Emailed codes work once, expire after 10 minutes and lock after 5 wrong tries. Only a scrambled copy of each code is stored.</li>
        <li>Everything that matters is written to the activity log: sign-ins, password and email changes, publishing, uploads.</li>
        <li>Changes are only accepted from this site’s own pages, and only from signed-in people.</li>
        <li>
          For a live server, set a long random PORTAL_SECRET in its environment, so sessions don’t depend on the setup password.
        </li>
      </ul>
    </section>
  );
}

function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={styles.roleBadge} data-role={role}>
      {role === "owner" ? "Owner" : "Editor"}
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  hint,
  error,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "password";
  hint?: string;
  error?: string;
  autoComplete?: string;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input
        className={styles.loginInput}
        type={type}
        value={value}
        autoComplete={autoComplete ?? "off"}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? <small className={styles.loginError}>{error}</small> : hint ? <small>{hint}</small> : null}
    </label>
  );
}
