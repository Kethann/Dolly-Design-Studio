# Visitor analytics setup

Tracking is **off by default**. No deployment, database creation, IPstack account or paid plan has been performed by these code changes.

## What the portal shows

Studio → Visitors (authenticated owners only): consenting visits in the last 24 hours / 7 / 30 days, active-recently estimate, browser/OS, approximate city/region/country, current page, pages/sections explored, estimated foreground active time, view counts and viewport depth. History is paginated in groups of 50.

A visit is a browser-tab session, **not a unique person**. Reloads/new tabs can create additional visits. Ad blockers, declined consent, unavailable networks, closed tabs and privacy signals cause undercounting. “Active recently” means a heartbeat within 90 seconds, not proof that someone is online or reading. There is no identification by name, email, fingerprint, exact GPS, or saved raw IP.

## Local testing

Set `VISITOR_ANALYTICS_ENABLED=true` in your local server environment, then restart `npm run dev`. This uses `.data/visitors/` only; the panel reads up to 1,000 local test records. Localhost never calls IPstack. This file adapter is for development, not a production analytics database. Decline and allow can be tested using the visitor privacy control at the bottom of the public page. Portal previews are excluded.

## Cloudflare activation (requires separate setup)

1. Create a D1 database: `npx wrangler d1 create dolly-visitors`.
2. Add the returned ID to `wrangler.jsonc` (do not use a placeholder in a real deployment):

```json
"d1_databases": [{
  "binding": "VISITORS_DB",
  "database_name": "dolly-visitors",
  "database_id": "YOUR_RETURNED_DATABASE_ID",
  "migrations_dir": "migrations/visitors"
}]
```

3. Apply the schema: `npx wrangler d1 migrations apply dolly-visitors --remote`.
4. Set `VISITOR_ANALYTICS_ENABLED` to `"true"` in the Worker's vars. Add a Cloudflare WAF/rate-limiting rule for `/api/visits` appropriate to your traffic and plan. The built-in bounded per-instance guard is not a distributed bot shield.
5. Optional IPstack: `npx wrangler secret put IPSTACK_ACCESS_KEY`. Use a plan/key supporting **HTTPS**. The code will never send a key/IP over plain HTTP; a plan/quota/network error falls back to Cloudflare's approximate metadata or “Unavailable”. Set `IPSTACK_MONTHLY_LIMIT` to your chosen allowance (default 100 attempted lookups/month, maximum 50,000). Only the first update for a visit attempts lookup. No API key is exposed in the browser or portal response.
6. Deploy through the normal synchronized Workers + Pages workflow **when authorized**. Both addresses already share the Worker/database, not separate copies. The daily Worker cron deletes data beyond 30 days (up to the next daily run); retained database backups follow Cloudflare's own policies. Verify the scheduled handler in Cloudflare after deployment.

Until both the enable flag and binding exist, the collector stays disabled and the portal explains the missing setup. A binding without the migration produces an explicit unavailable error, not fake counts.

## Privacy and operating limits

The public notice appears after the intro and offers equally accessible Allow/Decline. No visitor ID or events are created before opt-in. The choice is saved for 90 days; the session ID is only in memory. GPC and Do Not Track disable collection. Turning off tracking stops events and asks the server to remove the current visit; failures are shown with a retry path. Prior visits expire through retention. No query strings, search terms, form contents, clicks, screenshots or keystrokes are recorded. IPstack receives the request IP only after consent; the stored record contains just its coarse location result.

Heartbeats are at most once per minute while the tab is visible and recently used; failures back off. The portal polls every 30 seconds only while visible. Each visit keeps at most 50 distinct public page/section summaries, not an unlimited event stream. Production uses indexed D1 queries; it never scans the media/R2 bucket for analytics. Budget for additional Worker requests, D1 reads/writes, and IPstack usage; this feature does not guarantee free-tier capacity at any traffic level.

Before activation, review the notice and retention with whoever is responsible for the site's privacy policy. Verify opt-out, owner access, actual location fallback on **both** domains, quota limits, cron retention and expected traffic load.

References: https://developers.cloudflare.com/d1/worker-api/ and https://ipstack.com/how-to-use-ipstack-api/
