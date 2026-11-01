/** Presentation guard only. API routes remain responsible for authorization. */
export function canOpenPortalTool(user: { role: string; setup?: boolean }, tool: string): boolean {
  if (user.setup) return tool === "account";
  return tool !== "visitors" || user.role === "owner";
}
