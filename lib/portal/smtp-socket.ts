// Server-only: sending email over SMTP from a Cloudflare Worker.
//
// A normal mail library (nodemailer) needs Node's network modules, which a Worker doesn't have. A Worker can open its own
// outgoing connection with `connect()` (cloudflare:sockets), so this is a small SMTP client built on that: it talks to
// Gmail (smtp.gmail.com, port 465, TLS from the first byte) or any other SMTP server, signs in with the app password and
// sends one message. On an ordinary Node server the site keeps using nodemailer (see mail.ts).

export interface SocketMail {
  host: string;
  port: number;
  /** TLS from the first byte (port 465). Otherwise the connection starts plain and is upgraded with STARTTLS (587). */
  secure: boolean;
  user?: string;
  pass?: string;
  /** "Name <address>" or just an address. */
  from: string;
  to: string[];
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
}

/** True when running inside a Cloudflare Worker (where nodemailer cannot open a connection). */
export const inWorker = () => typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Anything that could end a header line early (and so inject another header) is removed. */
const clean = (s: string) => s.replace(/[\r\n]+/g, " ").trim();
const b64 = (bytes: Uint8Array | string) => {
  const u8 = typeof bytes === "string" ? enc.encode(bytes) : bytes;
  let bin = "";
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(bin);
};
/** Base64 in the 76-character lines mail expects. */
const wrap76 = (s: string) => s.replace(/.{1,76}/g, "$&\r\n").trimEnd();
/** A header value with non-ASCII letters, as an encoded word. */
const word = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const addressOf = (s: string) => (/<([^>]+)>/.exec(s)?.[1] ?? s).trim();
/** "Name <a@b>" with the name encoded when it needs to be. */
function mailbox(s: string) {
  const m = /^(.*?)\s*<([^>]+)>\s*$/.exec(clean(s));
  if (!m) return clean(s);
  const name = m[1].replace(/^"|"$/g, "");
  return name ? `${word(name)} <${m[2]}>` : m[2];
}

function build(m: SocketMail): string {
  const boundary = `dds_${crypto.randomUUID().replace(/-/g, "")}`;
  const domain = addressOf(m.from).split("@")[1] || "localhost";
  const head = [
    `From: ${mailbox(m.from)}`,
    `To: ${m.to.map((t) => mailbox(t)).join(", ")}`,
    ...(m.replyTo ? [`Reply-To: ${mailbox(m.replyTo)}`] : []),
    `Subject: ${word(clean(m.subject))}`,
    `Date: ${new Date().toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const part = (type: string, body: string) =>
    [`--${boundary}`, `Content-Type: ${type}; charset=UTF-8`, "Content-Transfer-Encoding: base64", "", wrap76(b64(body))].join("\r\n");
  return [head.join("\r\n"), "", part("text/plain", m.text), part("text/html", m.html), `--${boundary}--`, ""].join("\r\n");
}

/** Reads server replies line by line; a reply ends at the line whose fourth character is a space ("250 OK"). */
function reader(stream: ReadableStream<Uint8Array>) {
  const r = stream.getReader();
  let buf = "";
  return {
    async reply(): Promise<{ code: number; text: string }> {
      for (;;) {
        const lines = buf.split("\r\n");
        const done = lines.findIndex((l, i) => i < lines.length - 1 && /^\d{3}( |$)/.test(l));
        if (done >= 0) {
          const text = lines.slice(0, done + 1).join("\n");
          buf = lines.slice(done + 1).join("\r\n");
          return { code: Number(lines[done].slice(0, 3)), text };
        }
        const { value, done: ended } = await r.read();
        if (ended) throw new Error("The mail server closed the connection.");
        buf += dec.decode(value, { stream: true });
      }
    },
    release: () => r.releaseLock(),
  };
}

export async function sendViaSocket(m: SocketMail, timeoutMs = 20_000): Promise<void> {
  // Written as a value, not a fixed name, so the build tools leave it alone and the Worker itself supplies this built-in module.
  const spec = ["sockets", "cloudflare"].reverse().join(":"); // (a minifier cannot fold this back into one fixed name)
  const { connect } = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ spec)) as typeof import("cloudflare:sockets");
  const run = async () => {
    let socket = connect({ hostname: m.host, port: m.port }, { secureTransport: m.secure ? "on" : "starttls", allowHalfOpen: false });
    let rd = reader(socket.readable);
    let writer = socket.writable.getWriter();
    const send = (line: string) => writer.write(enc.encode(line + "\r\n"));
    const expect = async (ok: number[], what: string) => {
      const r = await rd.reply();
      if (!ok.includes(r.code)) throw new Error(`${what}: ${r.text.slice(0, 160)}`);
      return r;
    };
    try {
      await expect([220], "greeting");
      await send("EHLO dolly-design-studio");
      await expect([250], "hello");
      if (!m.secure) {
        await send("STARTTLS");
        await expect([220], "starttls");
        rd.release();
        writer.releaseLock();
        socket = socket.startTls({ expectedServerHostname: m.host });
        rd = reader(socket.readable);
        writer = socket.writable.getWriter();
        await send("EHLO dolly-design-studio");
        await expect([250], "hello");
      }
      if (m.user) {
        await send("AUTH LOGIN");
        await expect([334], "sign-in");
        await send(b64(m.user));
        await expect([334], "sign-in");
        await send(b64(m.pass ?? ""));
        await expect([235], "sign-in (check the app password)");
      }
      await send(`MAIL FROM:<${addressOf(m.from)}>`);
      await expect([250], "sender");
      for (const to of m.to) {
        await send(`RCPT TO:<${addressOf(to)}>`);
        await expect([250, 251], "recipient");
      }
      await send("DATA");
      await expect([354], "data");
      // A line that is only a dot would end the message early: such lines get a second dot.
      await writer.write(enc.encode(build(m).replace(/^\./gm, "..") + "\r\n.\r\n"));
      await expect([250], "message");
      await send("QUIT").catch(() => {});
    } finally {
      try {
        await socket.close();
      } catch {}
    }
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([run(), new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error("The mail server took too long.")), timeoutMs)))]);
  } finally {
    clearTimeout(timer);
  }
}
