# Deploying HoodMap (free tier: Vercel + AWS EC2 free-tier VM)

Split: **frontend → Vercel**, **API + indexer + stats worker → one AWS EC2
t2.micro/t3.micro VM**, both pointed at the existing Supabase DB and Alchemy RPC.
No DB migration needed.

## 1. Create the VM

- console.aws.amazon.com → EC2 → Launch Instance
- Name: `hoodmap` (anything)
- AMI: **Ubuntu Server 22.04 LTS** (or Amazon Linux 2023 — setup-vm.sh assumes
  a Debian/Ubuntu apt-based system; adjust the package manager lines if you pick
  Amazon Linux instead)
- Instance type: **t2.micro** (or t3.micro if t2.micro isn't offered in your
  region) — confirm the "Free tier eligible" badge is shown next to it
- Key pair: create a new one, download the `.pem` file, keep it — it's the only
  way to SSH in
- Network settings: allow SSH (22) from your IP (default), and for now also
  allow HTTP (80) / HTTPS (443) from anywhere if you'll terminate TLS on this
  VM later (see step 4) — you can add these rules afterward via the instance's
  Security Group if you skip it now
- Storage: default 8GB gp3 is within the free tier (up to 30GB free); bump it
  to make room for logs/build artifacts if you like, still free under 30GB
- Launch

Free tier here is **750 instance-hours/month for 12 months from account
creation** — enough for one instance running continuously all month, but it
expires after the year (unlike GCP's perpetual Always Free). Set a $1 Billing
Alert now (Billing Dashboard → Budgets) so you're notified if anything ever
drifts outside the free tier.

SSH in with the downloaded key:

```bash
chmod 400 hoodmap-key.pem
ssh -i hoodmap-key.pem ubuntu@<instance-public-ip>
```

(`ubuntu` is the default user for the Ubuntu AMI; Amazon Linux uses `ec2-user`.)

## 2. Rotate secrets before moving them

The Supabase DB password and Alchemy key were pasted in plaintext chat earlier in
this project. Before copying `.env` to a new machine:
- Supabase → Settings → Database → Reset password → update `DATABASE_URL`
- Alchemy dashboard → regenerate/rotate the app's API key → update `RPC_HTTP_URL` /
  `RPC_WS_URL` / `BACKFILL_RPC_URL`

Do this now, not after — it's free and takes two minutes, and there's no reason to
carry an already-exposed credential onto new infrastructure.

## 3. Provision the VM

Once SSH'd in (see step 1):

```bash
git clone <your-repo-url> /tmp/hoodmap-setup
cd /tmp/hoodmap-setup
bash deploy/setup-vm.sh
```

The script installs Node 20, creates an unprivileged `hoodmap` system user, clones
the repo to `/opt/hoodmap`, builds it, pauses so you can `scp` your (rotated) `.env`
into place, runs migrations, and installs the three systemd services in this
directory (`hoodmap-indexer`, `hoodmap-api`, `hoodmap-stats`) with `Restart=always`.

Copy `.env` over `scp`, never paste it into a shell command (shell history keeps it):

```bash
scp .env <vm-user>@<vm-external-ip>:/tmp/env-upload
```

## 4. Expose the API

The frontend (on Vercel) needs to reach the API over HTTPS. Cheapest path that
avoids buying a domain/cert setup immediately: **Cloudflare Tunnel** (free, no card,
no open inbound port needed) run as a fourth systemd service on the same VM,
pointing `api.yourdomain.com` (or a free `*.trycloudflare.com` for testing) at
`localhost:3001`. If you already have a domain, `certbot` + `nginx` reverse proxy
to `127.0.0.1:3001` works too — just remember to open ports 80/443 in the EC2
instance's **Security Group** (not just `ufw` — AWS's firewall sits in front of
the OS-level one and blocks traffic first if you don't open it there too).

Either way, once the API has a public HTTPS URL, set it as `NEXT_PUBLIC_API_URL`
(or whatever the frontend's env var is) in Vercel's project settings.

## 5. Deploy the frontend to Vercel

- vercel.com → New Project → import the repo, set root directory to `frontend/`
- Add the API URL env var from step 4
- Deploy — Vercel handles builds/CDN/HTTPS automatically, no server to manage

## 6. Verify

```bash
systemctl status hoodmap-indexer hoodmap-api hoodmap-stats
journalctl -u hoodmap-api -f      # tail logs live
journalctl -u hoodmap-indexer -n 100 --no-pager
```

All three should show `active (running)`. Hit `GET /health` from outside to confirm
the tunnel/proxy path works end to end — it already exists (`src/api/index.ts`) and
reports `{status: "ok", db: true, indexedThroughBlock}` on success, or a 503 with
`status: "degraded"` if the DB is unreachable while the API process is still up:

```bash
curl https://api.yourdomain.com/health
```

## 7. Monitoring (don't skip this)

Free uptime check: **UptimeRobot** (free tier, no card) polling
`https://api.yourdomain.com/health` every 5 minutes, alerting by email/Discord/
Telegram on a non-200 (catches both "API process down" and "DB unreachable" via
the 503 case above). This is the part that's easy to skip and the part that
actually matters — an e2-micro can OOM-kill a process under load, and
`Restart=always` recovers it, but you won't know it *happened* without something
watching from outside.

## Updating after a code change

```bash
cd /opt/hoodmap
sudo -u hoodmap git pull
sudo -u hoodmap npm ci
sudo -u hoodmap npm run build
sudo systemctl restart hoodmap-indexer hoodmap-api hoodmap-stats
```
