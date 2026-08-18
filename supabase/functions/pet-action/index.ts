import { serviceClient } from "../_shared/auth.ts";
import { json, options, readJson } from "../_shared/http.ts";

const actions = new Set(["poke", "slap", "feed", "throw"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (request) => {
  const preflight = options(request);
  if (preflight) return preflight;
  if (request.method !== "POST") return json(request, 405, { ok: false, reason: "method_not_allowed" });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const body = await readJson(request);
  if (!token) return json(request, 401, { ok: false, reason: "invalid_session" });
  if (!actions.has(body?.action) || typeof body?.request_id !== "string" || !uuidPattern.test(body.request_id)) {
    return json(request, 400, { ok: false, reason: "invalid_action" });
  }
  try {
    const admin = serviceClient();
    const { data: identity, error: identityError } = await admin.auth.getUser(token);
    if (identityError || !identity.user) return json(request, 401, { ok: false, reason: "invalid_session" });
    const { data, error } = await admin.rpc("m3_pet_action", {
      p_user_id: identity.user.id, p_action: body.action, p_request_id: body.request_id,
    });
    if (error || !data?.ok) return json(request, 409, { ok: false, reason: data?.reason || "pet_action_failed" });
    return json(request, 200, data);
  } catch { return json(request, 503, { ok: false, reason: "service_unavailable" }); }
});
