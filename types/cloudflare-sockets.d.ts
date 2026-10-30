// The part of Cloudflare's outgoing-connection API that the Worker mail sender uses (see lib/portal/smtp-socket.ts).
declare module "cloudflare:sockets" {
  interface Socket {
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
    close(): Promise<void>;
    startTls(options?: { expectedServerHostname?: string }): Socket;
  }
  export function connect(address: { hostname: string; port: number }, options?: { secureTransport?: "on" | "off" | "starttls"; allowHalfOpen?: boolean }): Socket;
}
