import { consumeRateLimit, isUuid, serviceClient } from "../_shared/auth.ts";
import { json, options, readJson } from "../_shared/http.ts";

const actions = new Set(["grant", "revoke"]);

Deno.serve(async (request) => {
  const preflight = options(request); if (preflight) return preflight;
  if (request.method !== "POST") return json(request, 405, { ok: false, reason: "method_not_allowed" });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const body = await readJson(request);
  if (!token) return json(request, 401, { ok: false, reason: "invalid_session" });
  if (!isUuid(body?.target_id) || !isUuid(body?.request_id) || typeof body?.action !== "string" || !actions.has(body.action)) {
    return json(request, 400, { ok: false, reason: "invalid_request" });
  }
  try {
    const admin = serviceClient();
    const { data: identity, error: identityError } = await admin.auth.getUser(token);
    if (identityError || !identity.user) return json(request, 401, { ok: false, reason: "invalid_session" });
    const rate = await consumeRateLimit(admin, "moderation_role", identity.user.id, request, 10, 600);
    if (!rate.allowed) return json(request, 429, { ok: false, reason: "rate_limited", retry_after_seconds: rate.retryAfterSeconds });
    const { data, error } = await admin.rpc("m8_manage_moderator", {
      p_admin_id: identity.user.id, p_target_id: body.target_id, p_action: body.action, p_request_id: body.request_id,
    });
    if (error || !data?.ok) {
      const status = data?.reason === "forbidden" ? 403 : data?.reason === "rate_limited" ? 429 : 409;
      return json(request, status, { ok: false, reason: data?.reason || "role_change_failed" });
    }
    return json(request, 200, data);
  } catch { return json(request, 503, { ok: false, reason: "service_unavailable" }); }
});
