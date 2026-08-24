import { consumeRateLimit, serviceClient } from "../_shared/auth.ts";
import { json, options, readJson } from "../_shared/http.ts";

Deno.serve(async (request) => {
  const preflight = options(request); if (preflight) return preflight;
  if (request.method !== "POST") return json(request, 405, { ok: false, reason: "method_not_allowed" });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const body = await readJson(request);
  if (!token) return json(request, 401, { ok: false, reason: "invalid_session" });
  const limit = typeof body?.limit === "number" && Number.isFinite(body.limit)
    ? Math.min(100, Math.max(1, Math.floor(body.limit)))
    : 20;
  try {
    const admin = serviceClient();
    const { data: identity, error: identityError } = await admin.auth.getUser(token);
    if (identityError || !identity.user) return json(request, 401, { ok: false, reason: "invalid_session" });
    const rate = await consumeRateLimit(admin, "moderation_history", identity.user.id, request, 60, 60);
    if (!rate.allowed) return json(request, 429, { ok: false, reason: "rate_limited", retry_after_seconds: rate.retryAfterSeconds });
    const { data, error } = await admin.rpc("m8_moderation_history", { p_moderator_id: identity.user.id, p_limit: limit });
    if (error || !data?.ok) return json(request, data?.reason === "forbidden" ? 403 : 503, { ok: false, reason: data?.reason || "service_unavailable" });
    return json(request, 200, data);
  } catch { return json(request, 503, { ok: false, reason: "service_unavailable" }); }
});
