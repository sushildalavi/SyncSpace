# Deploying to a single server

This runs SyncSpace on one Linux server with Docker: Caddy (automatic HTTPS), the web app, one API instance,
PostgreSQL and Redis. Only Caddy is reachable from outside. It works with any provider that gives you a server with a
public IP address. Nothing in this repository creates or pays for infrastructure.

## What you need

| Item | Notes |
| --- | --- |
| A server | Linux with Docker Engine and the Compose plugin. Building the images on the server needs memory: 4 GB is a comfortable starting point (an estimate, not a measured minimum). |
| A domain | Two names under it, for example `app.example.com` and `api.example.com`. |
| An SMTP account | Required. Sign-up confirmation, password reset and invitations are emails. |
| Open ports | 80 and 443 (TCP), plus 443 UDP if you want HTTP/3. |
| Google OAuth client | Optional. See [Google setup](googleSignIn.md). |

**Both names must share one registrable domain.** The session cookie is `SameSite=Lax`, so a web app and API on
unrelated domains cannot stay signed in. This includes two default subdomains on many hosting platforms.

## Steps

1. Create DNS `A` (and `AAAA`, if used) records for both names, pointing at the server.
2. On the server:

   ```bash
   git clone https://github.com/sushildalavi/SyncSpace.git && cd SyncSpace
   cp infrastructure/production/.env.production.example infrastructure/production/.env.production
   chmod 600 infrastructure/production/.env.production
   ```

3. Fill in `.env.production`. Generate the two secrets on the server. The file is ignored by git; keep it that way.
4. Start the stack:

   ```bash
   docker compose --env-file infrastructure/production/.env.production \
     -f infrastructure/production/docker-compose.yml up -d --build --wait
   ```

   The API applies database migrations on start. Caddy requests certificates on first launch, which needs DNS to be
   correct and ports 80 and 443 open.

5. Check it from your own computer:

   ```bash
   scripts/checkDeployment.sh app.example.com api.example.com
   ```

6. Create an account, confirm the email, and edit one document from two browsers.

## Operating it

The commands below use this shorthand:

```bash
dc() { docker compose --env-file infrastructure/production/.env.production \
  -f infrastructure/production/docker-compose.yml "$@"; }
```

| Task | Command |
| --- | --- |
| Logs | `dc logs -f api` |
| Update | `git pull && dc up -d --build --wait` |
| Back up | `dc exec -T postgres pg_dump -U syncspace -Fc syncspace > syncspace.dump` |
| Restore (replaces current data) | `dc stop api && dc exec -T postgres pg_restore -U syncspace -d syncspace --clean --if-exists --single-transaction < syncspace.dump && dc up -d --wait` |
| Stop, keeping data | `dc down` |

`dc down -v` **deletes the database**. Back up before updating, and copy backups off the server. Nothing schedules them
for you.

Changing `API_DOMAIN` needs a rebuild (`dc up -d --build`), because the address is compiled into the web app.

## What has been verified

Rehearsed on one machine with Docker, using `*.localhost` names and Caddy's self-signed certificate, with Mailpit as the
mail server:

- the stack starts healthy with `NODE_ENV=production`;
- `scripts/checkDeployment.sh` passes (run with `INSECURE=1`);
- two browser users sign up, confirm by email, sign in, accept an invitation and edit one document over `wss://`;
- the session cookie is `__Secure-`, `HttpOnly`, `SameSite=Lax`;
- data survives `down` and `up`, and the backup and restore commands recover a deleted document.

**Not verified:** a real server, public DNS, publicly trusted certificates, a real mail provider, and Google sign-in
on a public domain (it has been [checked locally](googleSignIn.md#4-what-is-and-isnt-verified)).

## Limits

One server means one point of failure, and updates cause a short interruption. The API can run as several instances
(see the [architecture](architecture.md)), but this setup runs one.
