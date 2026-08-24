import { consumeRateLimit, serviceClient } from "../_shared/auth.ts";
import { json, options } from "../_shared/http.ts";

Deno.serve(async (request) => {
  const preflight = options(request);
  if (preflight) return preflight;
  if (request.method !== "POST") return json(request, 405, { ok: false, reason: "method_not_allowed" });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(request, 401, { ok: false, reason: "invalid_session" });
  try {
    const admin = serviceClient();
    const { data: identity, error: identityError } = await admin.auth.getUser(token);
    if (identityError || !identity.user) return json(request, 401, { ok: false, reason: "invalid_session" });
    const rate = await consumeRateLimit(admin, "pet_get", identity.user.id, request, 120, 60);
    if (!rate.allowed) return json(request, 429, { ok: false, reason: "rate_limited", retry_after_seconds: rate.retryAfterSeconds });
    const { data: profile, error } = await admin.from("profiles")
      .select("appearance,pet_status,free_diy_available").eq("user_id", identity.user.id).maybeSingle();
    if (error || !profile) return json(request, 503, { ok: false, reason: "profile_unavailable" });
    const petStatus = profile.pet_status as Record<string, unknown> | null;
    return json(request, 200, {
      ok: true, appearance: profile.appearance, pet_status: profile.pet_status,
      free_diy_available: profile.free_diy_available,
      will_revive_on_save: Boolean(petStatus?.down),
    });
  } catch { return json(request, 503, { ok: false, reason: "service_unavailable" }); }
});
