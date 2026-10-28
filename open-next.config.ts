import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Plain setup: no incremental-cache layer. The portal's pages are rendered fresh per visit (see lib/content/store.ts).
export default defineCloudflareConfig();
