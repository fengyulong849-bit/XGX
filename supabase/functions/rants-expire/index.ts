import { getRequiredEnv, serviceClient } from "../_shared/auth.ts";
import { json, options } from "../_shared/http.ts";

Deno.serve(async (request) => {
  const preflight = options(request); if (preflight) return preflight;
  if (request.method !== "POST") return json(request, 405, { ok: false, reason: "method_not_allowed" });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
  if (token !== getRequiredEnv("CRON_SECRET")) return json(request, 401, { ok: false, reason: "unauthorized" });
  try {
    const { data, error } = await serviceClient().rpc("m7_expire_rants");
    if (error || !data?.ok) return json(request, 503, { ok: false, reason: "expiration_unavailable" });
    if (data.skipped === true) return json(request, 200, { ok: true, skipped: true, reason: "job_already_running", expired_count: 0 });
    return json(request, 200, data);
  } catch { return json(request, 503, { ok: false, reason: "expiration_unavailable" }); }
});
