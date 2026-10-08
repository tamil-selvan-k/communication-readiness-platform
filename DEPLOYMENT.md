# Deploying to EC2

Everything runs on one EC2 instance with Docker Compose:

```
browser ──HTTPS──▶ caddy :443 ──▶ frontend (nginx: React app + /api proxy) ──▶ backend :5000 ──▶ ai-service :8000
                   (Let's Encrypt)                                              └─▶ redis, PostgreSQL
```

A push to the `prod` branch runs `.github/workflows/deploy.yml`: tests → build the three images
(backend, ai-service, frontend) → push to Docker Hub → SSH into the server → migrate → start.

## 1. One-time server setup

1. **Security group (inbound):** TCP 22 (SSH), TCP 80, TCP 443, and UDP 443 (optional, HTTP/3).
   Remove any public rule for 5000 or 8000; those ports stay private now.
2. **Address:** point a domain's DNS **A record** at the instance's Elastic IP. Without a domain,
   use `<ip-with-dashes>.sslip.io` (for example `13-233-10-20.sslip.io` for 13.233.10.20). It resolves
   to that IP with no setup. HTTPS is required: browsers only allow the microphone on HTTPS pages.
3. **Free ports 80/443:** Caddy (in Compose) serves both. If nginx or Apache was installed on the
   host, stop it once:
   ```bash
   sudo systemctl disable --now nginx     # or apache2 / httpd
   ```
4. **Already in place from earlier deploys** (check them on a new server): Docker with the Compose
   plugin, the AWS CLI, an instance IAM role allowed `secretsmanager:GetSecretValue` on the secret `pcp`,
   and a `/opt/pcp` directory owned by the SSH user.
5. **CPU architecture:** images are built for ARM (Graviton: t4g, m7g…). For an x86 instance
   (t3, m5…) add two repository variables under GitHub → Settings → Secrets and variables → Actions → Variables:
   `BUILD_RUNNER=ubuntu-latest` and `DOCKER_PLATFORM=linux/amd64`.

GitHub repository secrets (unchanged): `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, `EC2_HOST`,
`EC2_USERNAME`, `EC2_SSH_PRIVATE_KEY`.

## 2. Secrets (AWS Secrets Manager → secret `pcp`)

Store every key from [.env.production.example](.env.production.example) as a key/value pair. The deploy
stops with a clear error if a required one is missing. Required:

| Key | Value |
|---|---|
| `SITE_ADDRESS` | `pcp.example.com` or `13-233-10-20.sslip.io` (no `https://`) |
| `CORS_ORIGIN` | `https://` + the same host |
| `APP_URL` | `https://` + the same host |
| `DATABASE_URL` | PostgreSQL 16 **with pgvector**. Supabase/RDS/Neon get SSL automatically |
| `JWT_SECRET` | `openssl rand -hex 32` |
| `AI_INTERNAL_KEY` | `openssl rand -hex 24` (Compose hands it to both backend and AI service) |
| `REDIS_PASSWORD` | `openssl rand -hex 24` (letters/digits only) |
| `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL` | The interviewer's LLM (see the template for providers) |
| `TRUST_PROXY` | `2` |

Leave out `REDIS_URL` and `AI_SERVICE_URL`; Compose sets them.

**No database yet?** Add `COMPOSE_PROFILES=local-db`, `POSTGRES_PASSWORD=<openssl rand -hex 16>` and
`DATABASE_URL=postgresql://postgres:<that password>@db:5432/comm_readiness`. A pgvector PostgreSQL then
runs in Compose with its data in a Docker volume.

## 3. Deploy

Merge into `prod` (or GitHub → Actions → CI/CD → **Run workflow**). The deploy job prints
`HTTPS is up: https://<SITE_ADDRESS>` when it finishes. The first certificate takes a few seconds.

### Without CI: build on the server

Copy the project to the server (for example to `/opt/pcp`), create `.env.production` from the
template, then run:

```bash
bash deploy/server-deploy.sh
```

It builds the images on the server, runs migrations and starts everything. Run it again after
each code update. It needs no Docker Hub account, GitHub secrets or AWS Secrets Manager.

## 4. First login

Migrations create no accounts in production. Create the platform owner on the server:

```bash
cd /opt/pcp
docker compose -f docker-compose.prod.yml --env-file .env.production \
  run --rm --no-deps backend npm run create-owner -- you@example.com "Your Name"
```

It prints a generated password once. The owner creates institutions and admins, and admins add students.

For a demo with ready-made accounts (`admin@demo.local`, `alice@demo.local`, `bob@demo.local`,
`charlie@demo.local`, password `Password123!`), set `SEED_DEMO_DATA=true` in the secret and deploy again;
the seed runs once on the next deploy. Do not leave those accounts on a public site.

Give every student 5 coins again:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production \
  run --rm --no-deps backend npm run restore-coins
```

## 5. Troubleshooting

All commands run in `/opt/pcp`. `dc` stands for
`docker compose -f docker-compose.prod.yml --env-file .env.production`.

| Symptom | Check |
|---|---|
| Deploy fails: "host service 'nginx' is holding port 80/443" | `sudo systemctl disable --now nginx`, then re-run the workflow |
| Deploy fails: "Missing from the 'pcp' secret" | Add the listed keys in Secrets Manager |
| Deploy fails at migrations | `DATABASE_URL` reachable from Docker? pgvector available (`CREATE EXTENSION vector`)? |
| Site does not open over HTTPS | DNS A record → this IP, ports 80/443 open, then `dc logs caddy` |
| Login says "network error" | `curl https://<site>/api/health` must return `{"status":"ok"…}`; `dc logs backend` |
| Login: "invalid credentials" | No accounts yet → section 4 |
| Mock interview: no microphone | The page must be HTTPS; use Chrome or Edge (browser speech recognition) |
| Interviewer gives generic questions | LLM key missing/invalid or its quota is used up (the AI service then falls back to mock questions); `dc logs ai-service` |
| 502 Bad Gateway | `dc ps` (all healthy?), `dc logs backend frontend` |

Live logs: `dc logs -f --tail=100 backend ai-service`.
