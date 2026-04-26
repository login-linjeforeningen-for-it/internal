# Login Internal API

Internal operational API for Login infrastructure dashboards, Docker status,
database backups, deployment actions, log summaries, and vulnerability scans.

## Docker Compose

Run the service with:

```sh
docker compose up -d --build
```

The container listens on port `8001` and mounts:

- `/var/run/docker.sock` so the API can inspect and restart local containers.
- `internal_data` for generated reports.
- `internal_backups` at `/home/dev/backups` for database backup files.
- `LOGIN_WORKSPACE_ROOT` at `/workspace` for deployment target discovery. If
  `LOGIN_WORKSPACE_ROOT` is not set, Compose mounts the parent Login workspace.

The production deployment is rebuilt with the server-side `rebuild -d` alias.
