import { consumeRateLimit, serviceClient } from "../_shared/auth.ts";
import { json, options, readJson } from "../_shared/http.ts";

const intervals = new Set([30, 45, 60, 90]);
function validInterval(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && intervals.has(value);
}
function validHour(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 23;
}
function validMinute(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 59;
}

Deno.serve(async (request) => {
  const preflight = options(request);
  if (preflight) return preflight;
  if (request.method !== "POST") return json(request, 405, { ok: false, reason: "method_not_allowed" });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const body = await readJson(request);
  const offHour = body?.off_hour, offMin = body?.off_min;
  const waterInterval = body?.water_interval, sitInterval = body?.sit_interval;
  if (!token) return json(request, 401, { ok: false, reason: "invalid_session" });
  if (!validHour(offHour) || !validMinute(offMin) || !validInterval(waterInterval) || !validInterval(sitInterval)) {
    return json(request, 400, { ok: false, reason: "invalid_work_preferences" });
  }
  try {
    const admin = serviceClient();
    const { data: identity, error: identityError } = await admin.auth.getUser(token);
    if (identityError || !identity.user) return json(request, 401, { ok: false, reason: "invalid_session" });
    const rate = await consumeRateLimit(admin, "work_preferences", identity.user.id, request, 30, 3600);
    if (!rate.allowed) return json(request, 429, { ok: false, reason: "rate_limited", retry_after_seconds: rate.retryAfterSeconds });
    const { data, error } = await admin.from("profiles").update({
      off_hour: offHour, off_min: offMin,
      water_interval: waterInterval, sit_interval: sitInterval,
    }).eq("user_id", identity.user.id).select("off_hour,off_min,water_interval,sit_interval").maybeSingle();
    if (error || !data) return json(request, 503, { ok: false, reason: "preferences_unavailable" });
    return json(request, 200, { ok: true, preferences: data });
  } catch { return json(request, 503, { ok: false, reason: "service_unavailable" }); }
});
