<div align="center">

<img src="https://s3.login.no/beehive/img/logo/logo-white-small.svg" alt="Login logo" width="80" height="80" />

<h1>Internal</h1>

<p>
  <img src="https://img.shields.io/badge/TypeScript-fd8738?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Bun-fd8738?style=flat-square&logo=bun&logoColor=white" alt="Bun" />
  <img src="https://img.shields.io/badge/Fastify-fd8738?style=flat-square&logo=fastify&logoColor=white" alt="Fastify" />
  <img src="https://img.shields.io/badge/PostgreSQL-fd8738?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/S3-fd8738?style=flat-square&logo=amazons3&logoColor=white" alt="S3" />
  <img src="https://img.shields.io/badge/Docker-fd8738?style=flat-square&logo=docker&logoColor=white" alt="Docker" />
</p>

</div>

---

Internal is an operational API for Login infrastructure, used by QueenBee for internal dashboards. It provides tooling for container management, database backups, deployment actions, log monitoring, and vulnerability scanning.

## Features

- **Docker container inspection and restart** via the Docker socket
- **Automated database backups** encrypted with age and uploaded to S3
- **Vulnerability scanning** on a nightly schedule
- **Log monitoring** with Discord alerts for anomalies
- **Deployment actions** against the Login workspace
- **Bearer token authentication** via Authentik

## Getting Started

1. **Configure environment**

   Create a `.env` file in the repo root. See [Configuration](#configuration) below or grab the values from 1Password.

2. **Start**

   ```bash
   docker compose up --build
   ```

   | Service  | URL                    |
   |----------|------------------------|
   | Internal | http://localhost:8001  |

## Configuration

All variables go in the root `.env` file. Database credentials are shared with Beekeeper and can be sourced from `../beekeeper/.env`.

| Name                       | Default                          | Notes                                                    |
|----------------------------|----------------------------------|----------------------------------------------------------|
| `PORT`                     | `8001`                           | API port                                                 |
| `DB`                       | `internal`                       | Postgres database name                                   |
| `DB_USER`                  | `internal`                       | Postgres username                                        |
| `DB_PASSWORD`              |                                  | Postgres password                                        |
| `API_TOKEN`                |                                  | Token for protected endpoints (optional)                 |
| `AUTHENTIK_URL`            | `https://authentik.login.no`     | Base URL for Authentik, used to build the userinfo URL   |
| `AUTHENTIK_USERINFO_URL`   |                                  | Override for the Authentik userinfo endpoint             |
| `S3_ENDPOINT`              |                                  | Remote S3 endpoint for backup uploads                    |
| `S3_ACCESS_KEY`            |                                  | Remote S3 access key                                     |
| `S3_SECRET_KEY`            |                                  | Remote S3 secret key                                     |
| `S3_BUCKET`                |                                  | Remote S3 bucket name                                    |
| `S3_REGION`                |                                  | Remote S3 region                                         |
| `S3_LOCAL_ENDPOINT`        |                                  | Local S3 endpoint for backup uploads                     |
| `S3_LOCAL_ACCESS_KEY`      |                                  | Local S3 access key                                      |
| `S3_LOCAL_SECRET_KEY`      |                                  | Local S3 secret key                                      |
| `S3_LOCAL_BUCKET`          |                                  | Local S3 bucket name                                     |
| `BACKUP_PATH`              | `/backups`                       | Path to database backup files                            |
| `BACKUP_AGE_PUBLIC_KEY`    |                                  | age public key for backup encryption                     |
| `BACKUP_ENCRYPTED_EXTENSION` | `.age`                         | File extension for encrypted backups                     |
| `LOG_ALERTS_ENABLED`       | `false`                          | Set to `true` to enable Discord log alerts               |
| `LOG_ALERTS_WEBHOOK_URL`   |                                  | Discord webhook URL for log alerts                       |
| `LOG_ALERTS_THREAD_ID`     |                                  | Discord thread ID for log alerts (optional)              |
| `LOG_ALERTS_SCHEDULE`      | `*/1 * * * *`                    | Cron schedule for log alert checks                       |
| `WEBHOOK_URL`              |                                  | Discord webhook URL for vulnerability scout alerts       |
| `CRITICAL_ROLE`            |                                  | Discord role ID to ping on critical findings (optional)  |
| `QUEENBEE_URL`             | `https://queenbee.login.no`      | QueenBee URL used for internal links                     |
| `BEEKEEPER_TOKEN`          |                                  | Service token for Beekeeper API calls                    |
| `LOGIN_WORKSPACE_ROOT`     | parent directory                 | Path to the Login workspace, mounted at `/workspace`     |

## Project Structure

- `src/handlers/` - HTTP handlers (backup, db, deploy, docker, stats, vulnerabilities)
- `src/routes.ts` - Route registration
- `src/config.ts` - Configuration and environment variable loading
- `src/db.ts` - Database client
- `src/utils/` - Helper utilities
