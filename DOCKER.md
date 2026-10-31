# Run Dolly Design Studio with Docker

This is a separate local/self-hosted runtime. It does not deploy to, read from, or
sync with Cloudflare Workers, Pages or R2. The website design is unchanged.

## Requirements and first run

Install Docker Desktop on Windows/macOS, or Docker Engine with Compose on Linux.
Use Linux containers and Docker Compose 2.24 or newer. Windows Home needs WSL 2
and hardware virtualization; installation can require a restart. Review Docker's
license terms for your business: https://docs.docker.com/desktop/setup/install/windows-install/

From the `site` folder:

```sh
docker compose up --build -d
docker compose ps
```

Open **http://localhost:3001**. Port 3000 remains available for the existing dev
server. The first build downloads dependencies and Google Fonts, so it requires
internet access and is heavier than running the finished image.

For portal sign-in, copy `.env.docker.example` to `.env.docker.local` and set a
strong `PORTAL_PASSWORD` and random `PORTAL_SECRET` before starting. Sign in at
`http://localhost:3001/portal` as **admin**, then create your own owner account.
There is no built-in shared test password. With neither credentials nor accounts
configured, the portal remains disabled. Configure your studio's mail credentials
in that file for OTP and enquiry delivery; email is not configured automatically.
After changing runtime secrets, run `docker compose up -d --force-recreate`.

The Docker image excludes `.env.local`, private account data and local videos.
It includes the source content/design JSON and public artwork as first-run seeds.
Existing cloud accounts and media are **not** transferred by installing Docker.
Never publish the image publicly if the included artwork is private/unreleased.

## Everyday commands

```sh
docker compose logs --tail=100 -f web
docker compose stop
docker compose start
docker compose up --build -d
docker compose stats
docker compose down
```

`down` removes containers, not the named data volumes. **Do not add `--volumes`
or `-v`, or run volume pruning, unless you intend to erase saved portal data.**

Content, accounts, enquiries, media and backups persist in named volumes. Rebuilds
replace the app but keep portal edits; they do not overwrite existing content
with newer seed JSON. Keep a separate backup of these volumes and your runtime
environment file before updates or moving hosts. The site's internal document
backups are not a substitute for a full media/account backup. Do not scale this
filesystem-backed service to multiple replicas: its write locks are process-local.

## Phones, tablets and another computer

Docker runs on a supported host, not directly on an iPhone/iPad. Other devices use
their browser. The default port is bound to loopback for safety. For a trusted LAN
preview only, set these environment variables before `docker compose up -d`:

```powershell
# Windows PowerShell
$env:DOLLY_BIND_ADDRESS = "0.0.0.0"
docker compose up -d
```

```sh
# macOS/Linux
DOLLY_BIND_ADDRESS=0.0.0.0 docker compose up -d
```

Then use `http://YOUR-COMPUTER-LAN-IP:3001` on the same network. Windows Firewall
may need a private-network rule; this setup does not change your firewall or router.
Do not expose this HTTP port directly to the internet. Portal cookies are Secure:
use localhost on the host, or an HTTPS reverse proxy with a trusted certificate
for portal sign-in on other devices. Do not disable secure cookies to use LAN HTTP.
No HTTPS proxy, domain, certificate or public tunnel is provisioned automatically.

For public self-hosting, set `DOLLY_SITE_URL` to the real HTTPS URL before building
(it controls SEO links), and put a properly configured HTTPS reverse proxy in
front. `DOLLY_PORT` changes the host port. `DOLLY_BUILD_ID` can identify a release.
Build-time public settings require a rebuild; secrets remain runtime-only.

## Resources and portability

The runtime uses a small multi-stage standalone image, a non-root user, bounded
logs, a health check, a 512 MB JavaScript heap budget and a 1 GB container memory
limit. The heap is only part of RAM usage: native image processing and buffers also
use memory. `docker compose stats` shows actual usage; raise limits if your tested
workload needs more. These limits do not include Docker Desktop/WSL or image builds.
Container builds use two Next.js workers and a 2 GB JavaScript heap budget; allow
several GB overall for builds. GPU animation still runs in each visitor's browser;
Docker does not remove browser/GPU requirements or guarantee equal frame rates.

The base image supports common x86-64 and ARM64 hosts. Build on each target host
with `docker compose up --build -d` so native dependencies match its CPU. An image
built only for one architecture is not automatically a multi-architecture image.

If Docker cannot start on Windows, check `wsl --version` and virtualization first.
Complete any administrator/terms prompts and restart Windows yourself if requested.
Do not keep rerunning app builds while the Docker engine is unavailable.
