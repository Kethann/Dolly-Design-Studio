/**
 * JSON for a <script type="application/ld+json"> block. Plain JSON.stringify would let a text containing "</script>"
 * (a project title, say) end the script tag early and inject markup; "<", ">" and "&" are written as unicode escapes,
 * which JSON readers (and search engines) read back exactly the same.
 */
export const jsonLdText = (data: unknown) => JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
