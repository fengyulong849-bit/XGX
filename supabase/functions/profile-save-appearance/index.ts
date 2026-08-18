import { serviceClient } from "../_shared/auth.ts";
import { json, options, readJson } from "../_shared/http.ts";

const keys = ["face", "hair", "glasses", "beard", "expr", "suit", "belly", "skin"] as const;
const maxValues = [2, 3, 2, 2, 3, 3, 2, 3];
function validAppearance(value: unknown): value is Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return keys.every((key, index) => typeof candidate[key] === "number" && Number.isInteger(candidate[key]) && candidate[key] >= 0 && candidate[key] <= maxValues[index]);
}

Deno.serve(async (request) => {
  const preflight = options(request);
  if (preflight) return preflight;
  if (request.method !== "POST") return json(request, 405, { ok: false, reason: "method_not_allowed" });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const body = await readJson(request);
  if (!token || !validAppearance(body?.appearance)) return json(request, 400, { ok: false, reason: "invalid_appearance" });
  try {
    const admin = serviceClient();
    const { data: identity, error: identityError } = await admin.auth.getUser(token);
    if (identityError || !identity.user) return json(request, 401, { ok: false, reason: "invalid_session" });
    const { data: saved, error } = await admin.rpc("m1_save_appearance", { p_user_id: identity.user.id, p_appearance: body.appearance });
    if (error || saved !== true) return json(request, 503, { ok: false, reason: "appearance_save_failed" });
    return json(request, 200, { ok: true, appearance: body.appearance });
  } catch { return json(request, 503, { ok: false, reason: "service_unavailable" }); }
});
