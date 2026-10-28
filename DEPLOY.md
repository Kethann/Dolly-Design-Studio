# Deploying to Cloudflare (Workers + R2)

Cloudflare Pages is being replaced by Workers with static assets. This project is set up for that (OpenNext adapter).
Everything below runs from the `site/` folder. The portal's content, accounts and uploads live in an R2 bucket.

## One-time setup
1. `npx wrangler login`  (opens your browser; sign in to YOUR Cloudflare account)
2. `npx wrangler r2 bucket create dolly-portal`  (R2 must be enabled in the dashboard first; it asks for a card but the free tier is generous)
3. Secrets (each command asks you to paste the value):
   - `npx wrangler secret put PORTAL_PASSWORD`  (the first-time "admin" setup password)
   - `npx wrangler secret put PORTAL_SECRET`    (any long random string; signs sign-in cookies)
   - Optional, for emailed codes / password reset: `npx wrangler secret put RESEND_API_KEY` and `npx wrangler secret put MAIL_FROM`

## Deploy
`npm run cf:deploy`  → prints your `https://dolly-design-studio.<you>.workers.dev` address.
Try it locally first (simulated R2): copy `.dev.vars.example` to `.dev.vars`, then `npm run cf:preview`.

## Custom domain
Cloudflare dashboard → Workers & Pages → dolly-design-studio → Settings → Domains & Routes → Add.

## Auto-deploy from GitHub (optional)
Dashboard → Workers & Pages → Create → Import a repository (your own GitHub account). Build command `npm run cf:build`,
deploy command `npx opennextjs-cloudflare deploy`. Add the same secrets under Settings → Variables and Secrets.

## Things to know
- Images are served exactly as uploaded (Workers has no image optimiser/resizer), so upload web-sized files (WebP/JPG, ideally under ~2 MB; slate titles trimmed PNGs). Uploads are capped at 30 MB.
- Gmail/SMTP does not work on Workers; use Resend there. On a normal Node host Gmail still works (`GMAIL_USER`, `GMAIL_APP_PASSWORD`).
- Sign-in attempt limits are per worker instance, not global.
- Never commit `.env.local` or `.dev.vars`.
