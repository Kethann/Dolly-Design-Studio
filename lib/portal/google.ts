// Server-only: "Continue with Google" for the portal.
//
// Switched on by two settings from Google Cloud Console (APIs & Services → Credentials → OAuth client ID → Web application):
//     GOOGLE_CLIENT_ID=…apps.googleusercontent.com
//     GOOGLE_CLIENT_SECRET=…
// and, under "Authorised redirect URIs", the address(es) of this site followed by /api/portal/google/callback, for example
//     https://dolly-design-studio.dollydesignstudios.workers.dev/api/portal/google/callback
//     http://localhost:3000/api/portal/google/callback
//
// Google only proves which email address the person controls. They are let in only if that address is the confirmed email of
// a portal account, so nobody new can get in this way. Google sign-in replaces the password and the emailed code (the Google
// account has its own protection).
export const googleConfigured = () => !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

export const GOOGLE_COOKIE = "dds_g";
export const redirectUriFor = (origin: string) => `${origin}/api/portal/google/callback`;

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const randomToken = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));

/** The PKCE challenge for a secret verifier: Google checks the code can only be exchanged by whoever started the sign-in. */
export async function challengeFor(verifier: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}
