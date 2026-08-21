import { isUuid, serviceClient } from "../_shared/auth.ts";
import { json, options, readJson } from "../_shared/http.ts";

function containsSensitive(content: string): boolean {
  return /(?<!\d)1[3-9]\d{9}(?!\d)|[\w.+-]+@[\w-]+\.[\w.-]+|\b\d{17}[\dXx]\b/.test(content);
}

Deno.serve(async (request) => {
  const preflight = options(request); if (preflight) return preflight;
  if (request.method !== "POST") return json(request, 405, { ok: false, reason: "method_not_allowed" });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const body = await readJson(request);
  if (!token) return json(request, 401, { ok: false, reason: "invalid_session" });
  if (typeof body?.content !== "string" || !isUuid(body?.request_id) || body.content.trim().length < 1 || body.content.trim().length > 50) return json(request, 400, { ok: false, reason: "invalid_content" });
  if (containsSensitive(body.content)) return json(request, 400, { ok: false, reason: "sensitive_content" });
  try {
    const admin = serviceClient(); const { data: identity, error: identityError } = await admin.auth.getUser(token);
    if (identityError || !identity.user) return json(request, 401, { ok: false, reason: "invalid_session" });
    const { data, error } = await admin.rpc("m5_release_draft", { p_user_id: identity.user.id, p_content: body.content, p_request_id: body.request_id });
    if (error || !data?.ok) return json(request, 409, { ok: false, reason: data?.reason || "release_failed" });
    return json(request, 200, data);
  } catch { return json(request, 503, { ok: false, reason: "service_unavailable" }); }
});
