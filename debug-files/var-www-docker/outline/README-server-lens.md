# Outline — server-lens

## Current version when image tag is `latest`

Your compose uses `image: docker.getoutline.com/outlinewiki/outline:latest`, so the image tag is literally `latest`. server-lens now:

1. Tries **container/image labels** (`org.opencontainers.image.version`)
2. Then **digest fallback** — shows short image ID (e.g. `sha256:abc123456789`) so you can compare with upstream

So **current_version** will show the digest instead of `latest` when labels are missing. To show the real app version, add a version command in `server-lens.toml` if Outline supports one:

```toml
[container_version_commands]
"outline" = "node -e \"console.log(require('/opt/outline/build/package.json').version)\""   # example; adjust path if needed
```

## Latest version (no token if you don’t own the repo)

Use the **Docker Hub** probe so you don’t need a GitHub token (same image `outlinewiki/outline`):

```toml
[[probes]]
name       = "outline"
probe_type = "dockerhub"
category   = "container"
repo_url   = "https://hub.docker.com/r/outlinewiki/outline"
args.image      = "outlinewiki/outline"
args.tag_filter = "^\\d+\\.\\d+(\\.\\d+)?$"
```

The probe picks the **highest semver tag** (e.g. `1.5.0`), not the `latest` tag. **latest_version** will be filled without any token.
