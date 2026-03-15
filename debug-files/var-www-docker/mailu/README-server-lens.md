# Mailu — server-lens

## Grouping (mailu/admin, mailu/oletools, …)

In `server-lens.toml` set:

```toml
[container_groups]
mailu = ["admin", "dovecot", "nginx", "postfix", "rspamd", "unbound", "oletools", "webmail", "redis"]
```

Container names must match the **image** short name (e.g. `admin` from `ghcr.io/mailu/admin`), not the compose service name. The UI then shows **mailu/admin**, **mailu/oletools**, etc., and sorts them together.

## Current version (avoid hash)

- **Image tag:** When you use a tagged image (e.g. `ghcr.io/mailu/admin:2024.06`), server-lens keeps that tag as current version when it looks like a version (e.g. `2024.06`), so you see **2024.06** instead of a digest.
- **From container:** For containers in the mailu group, server-lens runs `cat /version` inside the container (Mailu writes its version there). If that works, that value is used as current version.
- **Latest version:** GHCR probe with a relaxed `tag_filter` for date-style tags (e.g. `^\d{4}\.\d{2}(\.\d+)?$`) so **latest_version** is the newest Mailu tag (e.g. `2024.06.47`). Add a `[[probes]]` per image if you want to override.

## Version format

Mailu uses **year.month.patch** (e.g. `2024.06`, `2024.06.47`). Images are on GHCR as `ghcr.io/mailu/<service>:<tag>`.
