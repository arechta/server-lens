# GHCR token setup for server-lens

server-lens can get the latest image tags from **GitHub Container Registry (ghcr.io)**. You have two options if you **don’t own** the repositories.

## Option A: Use Docker Hub instead (no token)

Many images exist on **both** GHCR and **Docker Hub**. For those, use the **dockerhub** probe so you don’t need a GitHub token at all.

Example — Outline (public image, you’re not the owner):

```toml
[[probes]]
name       = "outline"
probe_type = "dockerhub"
category   = "container"
repo_url   = "https://hub.docker.com/r/outlinewiki/outline"
args.image      = "outlinewiki/outline"
args.tag_filter = "^\\d+\\.\\d+(\\.\\d+)?$"
```

Same image as `ghcr.io/outlinewiki/outline`; Docker Hub’s API allows listing public tags without auth (with rate limits). Check the image on hub.docker.com and use `probe_type = "dockerhub"` when it’s there.

## Option B: Use GHCR (token or anonymous)

For images that are **only** on GHCR, server-lens first tries **anonymous** access (no token). If the package is public and GHCR allows it, tags are listed and you get **latest_version** without any config. If that fails (401), a token is required.

## 1. Use the right auth flow (two steps)

**Do not** send your GitHub PAT as `Authorization: Bearer <pat>` to `ghcr.io/v2/.../tags/list`. That returns `invalid token`.

GHCR expects:

1. **Exchange PAT for a registry token**  
   Send your PAT to the token endpoint with `Authorization: Basic base64(oauth:YOUR_PAT)`:

   ```bash
   CREDS=$(echo -n "oauth:YOUR_GITHUB_TOKEN" | base64 | tr -d '\n')
   curl -s "https://ghcr.io/token?service=ghcr.io&scope=repository:outlinewiki/outline:pull" \
     -H "Authorization: Basic $CREDS"
   ```

   The response JSON contains a short-lived `"token"` (a long JWT).

2. **Use that token for the tags API**  
   Use the **token value from step 1** (not your PAT) as Bearer:

   ```bash
   curl -s "https://ghcr.io/v2/outlinewiki/outline/tags/list" \
     -H "Authorization: Bearer <paste_token_from_step1_here>"
   ```

   You should get JSON with a `"tags"` array.

The script `scripts/test-ghcr-token.sh` does both steps for you.

## 2. Give the token the right permissions (fine-grained PAT)

If step 1 returns an error or step 2 returns `invalid token`, the token often has **no permissions**.

For a **fine-grained** Personal Access Token:

1. Open the token in GitHub: **Settings → Developer settings → Personal access tokens → Fine-grained tokens**.
2. **Repository access**  
   The token must have access to the repos that own the container images. For example, for `outlinewiki/outline`:
   - Choose e.g. **“All repositories”** or **“Only select repositories”** and add the `outlinewiki/outline` repo (or the org that owns the packages you care about).
3. **Repository permissions**  
   For that access, set:
   - **Packages: Read** (so the token can read container metadata from ghcr.io).

Save the token. Then run `./scripts/test-ghcr-token.sh` again (or the two curl commands above). After that, server-lens can fill **latest_version** for GHCR containers.

### Classic PAT (for GHCR when anonymous fails)

If you use a **classic** token, create it with the **`read:packages`** scope. That scope lets you read **public** packages without needing access to the repository. Fine-grained tokens need explicit repository access, so for “outsider” use classic PAT with `read:packages` if you want to stick with GHCR.
