import { serviceClient, isUuid } from "../_shared/auth.ts";
import { json, options, readJson } from "../_shared/http.ts";

const reasons = new Set(["privacy", "abuse", "other"]);

Deno.serve(async (request) => {
  const preflight = options(request);
  if (preflight) return preflight;
  if (request.method !== "POST") return json(request, 405, { ok: false, reason: "method_not_allowed" });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const body = await readJson(request);
  if (!token) return json(request, 401, { ok: false, reason: "invalid_session" });
  if (!isUuid(body?.rant_id) || !isUuid(body?.request_id) || typeof body?.reason !== "string" || !reasons.has(body.reason)) {
    return json(request, 400, { ok: false, reason: "invalid_request" });
  }
  try {
    const admin = serviceClient();
    const { data: identity, error: identityError } = await admin.auth.getUser(token);
    if (identityError || !identity.user) return json(request, 401, { ok: false, reason: "invalid_session" });
    const { data, error } = await admin.rpc("m4_report_rant", { p_user_id: identity.user.id, p_rant_id: body.rant_id, p_reason: body.reason, p_request_id: body.request_id });
    if (error || !data?.ok) return json(request, 409, { ok: false, reason: data?.reason || "report_failed" });
    return json(request, 200, data);
  } catch { return json(request, 503, { ok: false, reason: "service_unavailable" }); }
});
