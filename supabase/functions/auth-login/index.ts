import {
  anonClient,
  consumeRateLimit,
  isValidAccount,
  isValidPassword,
  normalizeAccount,
  serviceClient,
} from "../_shared/auth.ts";
import { json, options, readJson } from "../_shared/http.ts";

Deno.serve(async (request) => {
  const preflight = options(request);
  if (preflight) return preflight;
  if (request.method !== "POST") return json(request, 405, { ok: false, reason: "method_not_allowed" });

  const body = await readJson(request);
  const account = normalizeAccount(body?.account);
  const password = body?.password;
  if (!isValidAccount(account) || !isValidPassword(password)) {
    return json(request, 401, { ok: false, reason: "invalid_credentials" });
  }

  try {
    const admin = serviceClient();
    const rate = await consumeRateLimit(admin, "auth.login", account, request, 10, 900);
    if (!rate.allowed) return json(request, 429, { ok: false, reason: "rate_limited", retry_after_seconds: rate.retryAfterSeconds });

    const { data: lookup, error: lookupError } = await admin.rpc("m1_lookup_login", { p_account: account });
    const row = Array.isArray(lookup) ? lookup[0] : null;
    if (lookupError || !row?.login_email) return json(request, 401, { ok: false, reason: "invalid_credentials" });

    const { data: login, error: loginError } = await anonClient().auth.signInWithPassword({
      email: row.login_email,
      password,
    });
    if (loginError || !login.session) return json(request, 401, { ok: false, reason: "invalid_credentials" });

    const { data: profile } = await admin
      .from("profiles")
      .select("points_balance, free_diy_available")
      .eq("user_id", row.user_id)
      .maybeSingle();

    return json(request, 200, {
      ok: true,
      access_token: login.session.access_token,
      refresh_token: login.session.refresh_token,
      profile: {
        points_balance: profile?.points_balance ?? 0,
        free_diy_available: profile?.free_diy_available ?? false,
      },
    });
  } catch {
    return json(request, 503, { ok: false, reason: "service_unavailable" });
  }
});
