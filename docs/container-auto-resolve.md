# Container auto-resolve (custom-built images)

For **custom-built** containers (docker-compose `build:` + Dockerfile), `docker ps` shows a local image name (e.g. `redis-dashboard-redis-dashboard:latest`), so server-lens cannot infer the upstream image from the image ref.

**No hardcoded mapping.** Auto-resolve uses one of:

1. **Registry in image ref** — If the image is from a registry (e.g. `ghcr.io/owner/image:tag` or `docker.io/owner/image:tag`), server-lens parses it and probes that registry. No config needed.
2. **Label in your image** — In the Dockerfile of your custom build, add:
   ```dockerfile
   LABEL io.server-lens.base-image="owner/image"
   ```
   Example: `LABEL io.server-lens.base-image="redis/redisinsight"`. server-lens reads this from the container and probes that Docker Hub image for latest_version.
3. **TOML override** — In `server-lens.toml`, `[container_base_images]` or a `[[probes]]` entry overrides or adds custom tracking (same idea as RUNTIME).

So custom-built images are resolved **by adding one LABEL** in the Dockerfile (or by config). No hardcoded list in the tool.
