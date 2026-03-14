/**
 * Auth middleware — Bearer token guard
 * Enforced when host != 127.0.0.1
 */

import type { Request } from "bun";

export function requireAuth(req: Request, token: string | undefined): { ok: true } | { ok: false; status: number; body: object } {
  if (!token) return { ok: true }; // No token configured — allow (localhost only)
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return {
      ok: false,
      status: 401,
      body: { error: "unauthorized", message: "Missing or invalid Bearer token", status: 401 },
    };
  }
  const provided = auth.slice(7);
  if (provided !== token) {
    return {
      ok: false,
      status: 401,
      body: { error: "unauthorized", message: "Invalid token", status: 401 },
    };
  }
  return { ok: true };
}

/** Returns true if server must refuse to start (non-localhost without token) */
export function mustRefuseStart(host: string, token: string | undefined): boolean {
  const isLocal = host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "";
  return !isLocal && !token;
}
