// What the login screen says when "Continue with Google" does not end in a sign-in (?google=<code> on /portal).
export const GOOGLE_MESSAGES: Record<string, string> = {
  off: "Google sign-in isn’t switched on yet.",
  cancelled: "Google sign-in was cancelled.",
  expired: "That sign-in took too long or was already used. Try again.",
  failed: "Google didn’t accept the sign-in. Try again.",
  busy: "Too many attempts. Try again in a few minutes.",
  nouser: "That Google account isn’t linked to a portal account. Sign in with your password, then add the same Gmail address under Account → Email.",
};
