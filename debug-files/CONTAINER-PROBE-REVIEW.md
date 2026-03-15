# Container probe review (server-lens.json)

Summary of container version probing from your latest scan.

---

## Working (token + probe OK)

| Container   | Source     | Current   | Latest   | Note |
|------------|------------|-----------|----------|------|
| **outline**   | dockerhub  | 1.5.0     | 1.5.0    | No GitHub token needed; Docker Hub probe. |
| **opengist**  | ghcr       | 1         | 1.12.1   | Classic token works; GHCR tags listed. |

So: **classic token is correct** and GHCR is working for images that publish semver-style tags (e.g. opengist).

---

## GHCR “No version tag found” (token OK, tag format not matched)

These are all **mailu** images (`mailu/postfix`, `mailu/unbound`, etc.). The probe reaches GHCR and gets the tag list, but no tag matches the default filter `^\d+\.\d+\.\d+$` (e.g. `1.2.3`).

- admin, dovecot, oletools, postfix, rspamd, unbound, webmail

Mailu often uses **date-style** tags (e.g. `2024.06.47`) or **two-part** tags (e.g. `1.9`). The former already match the default filter; if the registry only has `1.9` or `latest`, you need a custom `tag_filter`.

To get **latest_version** for Mailu images, add explicit probes in `server-lens.toml` with a relaxed filter, for example:

```toml
# Example: allow x.y or x.y.z (e.g. 1.9 or 2024.06.47)
[[probes]]
name       = "postfix"
probe_type = "ghcr"
category   = "container"
repo_url   = "https://github.com/mailu/mailu"
args.owner      = "mailu"
args.image      = "postfix"
args.tag_filter = "^\\d+\\.\\d+(\\.\\d+)?$"
```

Repeat for `admin`, `dovecot`, `oletools`, `rspamd`, `unbound`, `webmail` with the same `args.image` and `tag_filter` if you want latest_version for each.

---

## Untracked / binary (no registry probe)

These have no TOML probe and no auto-probe match (e.g. custom/compose image names), so **latest_version** is not fetched:

- n8n-n8n, hoppscotch, postgres-postgres, redis-*, typesense-*, redis-dashboard-red…

To get latest for them:

- **n8n-n8n**: add `[container_base_images] "n8n-n8n" = "n8nio/n8n"` so we probe Docker Hub for that base image.
- Others: add a `[[probes]]` with the right `probe_type` and `args` (dockerhub or ghcr) when the image exists on a registry.

---

## Summary

| Status              | Count | Action |
|---------------------|-------|--------|
| Probe success       | 2     | outline (dockerhub), opengist (ghcr) — classic token works. |
| GHCR tag_filter     | 7     | Mailu images — add optional probes with relaxed `tag_filter` if you want latest_version. |
| Untracked / binary  | 16    | Add `container_base_images` or `[[probes]]` for the ones you care about. |

Your **classic token is working**; opengist proves GHCR access. The remaining empty **latest_version** values are due to tag naming (Mailu) or missing probe config (untracked containers), not the token.
