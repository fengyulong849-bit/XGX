import { serviceClient } from "../_shared/auth.ts";
import { json, options } from "../_shared/http.ts";

Deno.serve(async (request) => {
  const preflight = options(request); if (preflight) return preflight;
  if (request.method !== "POST") return json(request, 405, { ok: false, reason: "method_not_allowed" });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(request, 401, { ok: false, reason: "invalid_session" });
  try {
    const admin = serviceClient(); const { data: identity, error: identityError } = await admin.auth.getUser(token);
    if (identityError || !identity.user) return json(request, 401, { ok: false, reason: "invalid_session" });
    const { data, error } = await admin.rpc("m4_list_my_rants", { p_user_id: identity.user.id });
    if (error || !data?.ok) return json(request, 503, { ok: false, reason: data?.reason || "service_unavailable" });
    return json(request, 200, data);
  } catch { return json(request, 503, { ok: false, reason: "service_unavailable" }); }
});
