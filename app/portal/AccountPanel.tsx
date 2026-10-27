"use client";

import { useCallback, useEffect, useState } from "react";
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

const when = (iso?: string) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "never";

/** Users & security: your own account and password, and (for owners) everyone who can use the portal. */
export function AccountPanel({ me }: { me: PortalUser }) {
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
        <h2>Users &amp; security</h2>
        <p>Who can open this portal, and how they sign in.</p>
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

function MyAccount({ me, run }: { me: PortalUser; run: (fn: () => Promise<unknown>, ok: string) => Promise<boolean> }) {
  const [name, setName] = useState(me.name);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const mismatch = pw.confirm.length > 0 && pw.confirm !== pw.next;
  return (
    <section className={styles.card}>
      <h3>Your account</h3>
      <dl className={styles.facts}>
        <dt>Username</dt>
        <dd>{me.username}</dd>
        <dt>Role</dt>
        <dd>
          <RoleBadge role={me.role} />
        </dd>
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

      <h4>Change password</h4>
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
        <Field
          label="Current password"
          type="password"
          value={pw.current}
          onChange={(current) => setPw({ ...pw, current })}
          autoComplete="current-password"
        />
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
        <button
          type="submit"
          className={styles.primaryButton}
          disabled={!pw.current || pw.next.length < PASSWORD_MIN || pw.next !== pw.confirm}
        >
          Change password
        </button>
      </form>
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
  const [form, setForm] = useState({ name: "", username: "", password: "", role: "editor" as Role });
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
              setForm({ name: "", username: "", password: "", role: "editor" });
              setAdding(false);
            }
          }}
        >
          <Field label="Name" value={form.name} onChange={(name) => setForm({ ...form, name })} />
          <Field label="Username" value={form.username} onChange={(username) => setForm({ ...form, username })} />
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
                  {u.username} · last sign-in {when(u.lastSignIn)}
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
