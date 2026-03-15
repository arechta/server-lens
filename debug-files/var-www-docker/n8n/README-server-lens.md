# n8n custom build — server-lens and auto-update.sh

This service uses a **custom-built** image (docker-compose `build:` + Dockerfile), not a direct pull from a registry. The Dockerfile bases on `docker.n8n.io/n8nio/n8n:stable` and adds apk, Baileys, etc.

## Avoiding mismatch with auto-update.sh

- **auto-update.sh** decides updates by:
  1. Reading the **base image** from the Dockerfile (`FROM ...` excluding `AS`).
  2. Pulling that base and comparing **digests** (and optionally version from `docker exec n8n n8n --version` or labels).
  3. Skipping rebuild when version numbers already match (even if digest changed).

- **server-lens** only sees what `docker ps` reports. The running image is typically named like `n8n-n8n:latest` (compose project + service). That is a **local** image name, so server-lens does not probe it by default.

To align server-lens with the same upstream as auto-update.sh (the base image), add a **base image mapping** in `server-lens.toml`:

```toml
[container_base_images]
"n8n-n8n" = "n8nio/n8n"
```

Use the **container name** as Docker shows it (e.g. `n8n` or `n8n-n8n` depending on compose project name). The value is the Docker Hub repo (no registry host, no tag). With this, server-lens will probe `n8nio/n8n` on Docker Hub for the latest version and show it for this container.

## Current version (multi-step detection)

For custom-built images, server-lens takes the **image tag** from `docker ps` as the “current” version (e.g. `latest`). It does not run `docker exec n8n n8n --version` or read container labels. So:

Steps (same for **all containers**): 1) Container labels `org.opencontainers.image.version`, 2) Image labels, 3) Docker exec (config or built-in for n8n), 4) Image tag from `docker ps`, 5) **Digest fallback** — short image ID (e.g. `sha256:abc123456789`) so you can match with upstream. For other containers set `[container_version_commands]` if the app has a `--version` flag.

## Summary

| Source of truth        | auto-update.sh              | server-lens (with mapping)   |
|------------------------|-----------------------------|------------------------------|
| Upstream for “latest”  | Base image from Dockerfile  | `container_base_images` → same repo (n8nio/n8n) |
| Current version        | `docker exec` / labels      | Labels → image labels → exec (n8n built-in) → tag fallback     |

Adding `[container_base_images] "n8n-n8n" = "n8nio/n8n"` removes the mismatch for **latest**; any remaining difference is only in how “current” is obtained (tag vs binary version).
