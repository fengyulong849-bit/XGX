import { consumeRateLimit, isUuid, serviceClient } from "../_shared/auth.ts";
import { json, options, readJson } from "../_shared/http.ts";

const decisions = new Set(["approved", "hidden", "rejected"]);

Deno.serve(async (request) => {
  const preflight = options(request); if (preflight) return preflight;
  if (request.method !== "POST") return json(request, 405, { ok: false, reason: "method_not_allowed" });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const body = await readJson(request);
  if (!token) return json(request, 401, { ok: false, reason: "invalid_session" });
  if (!isUuid(body?.rant_id) || !isUuid(body?.request_id) || typeof body?.decision !== "string" || !decisions.has(body.decision) || (body.note !== undefined && (typeof body.note !== "string" || body.note.length > 500))) {
    return json(request, 400, { ok: false, reason: "invalid_request" });
  }
  try {
    const admin = serviceClient();
    const { data: identity, error: identityError } = await admin.auth.getUser(token);
    if (identityError || !identity.user) return json(request, 401, { ok: false, reason: "invalid_session" });
    const rate = await consumeRateLimit(admin, "moderation_review", identity.user.id, request, 30, 600);
    if (!rate.allowed) return json(request, 429, { ok: false, reason: "rate_limited", retry_after_seconds: rate.retryAfterSeconds });
    const { data, error } = await admin.rpc("m8_review_rant", {
      p_moderator_id: identity.user.id, p_rant_id: body.rant_id, p_decision: body.decision,
      p_note: body.note ?? "", p_request_id: body.request_id,
    });
    if (error || !data?.ok) return json(request, data?.reason === "forbidden" ? 403 : 409, { ok: false, reason: data?.reason || "review_failed" });
    return json(request, 200, data);
  } catch { return json(request, 503, { ok: false, reason: "service_unavailable" }); }
});
