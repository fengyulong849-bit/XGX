import { anonClient, consumeRateLimit, isUuid, isValidPassword, serviceClient } from "../_shared/auth.ts";
import { json, options, readJson } from "../_shared/http.ts";

const CONFIRMATION = "注销";

Deno.serve(async (request) => {
  const preflight = options(request);
  if (preflight) return preflight;
  if (request.method !== "POST") return json(request, 405, { ok: false, reason: "method_not_allowed" });

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const body = await readJson(request);
  const currentPassword = body?.current_password;
  if (!token) return json(request, 401, { ok: false, reason: "invalid_session" });
  if (!isUuid(body?.request_id) || body?.confirmation !== CONFIRMATION || !isValidPassword(currentPassword)) {
    return json(request, 400, { ok: false, reason: "invalid_input" });
  }

  try {
    const admin = serviceClient();
    const { data: identity, error: identityError } = await admin.auth.getUser(token);
    if (identityError || !identity.user) return json(request, 401, { ok: false, reason: "invalid_session" });

    const rate = await consumeRateLimit(admin, "account_delete", identity.user.id, request, 3, 600);
    if (!rate.allowed) return json(request, 429, { ok: false, reason: "rate_limited", retry_after_seconds: rate.retryAfterSeconds });

    const { data: credential, error: credentialError } = await admin
      .from("account_credentials")
      .select("login_email")
      .eq("user_id", identity.user.id)
      .maybeSingle();
    if (credentialError || !credential?.login_email) return json(request, 401, { ok: false, reason: "invalid_session" });

    const { error: passwordError } = await anonClient().auth.signInWithPassword({
      email: credential.login_email,
      password: currentPassword,
    });
    if (passwordError) return json(request, 401, { ok: false, reason: "invalid_current_password" });

    // Auth 用户是个人数据的根。硬删除触发级联删除，公开吐槽会立即从随机墙消失。
    const { error: deleteError } = await admin.auth.admin.deleteUser(identity.user.id, false);
    if (deleteError) return json(request, 503, { ok: false, reason: "account_delete_failed" });

    return json(request, 200, { ok: true, request_id: body.request_id });
  } catch {
    return json(request, 503, { ok: false, reason: "service_unavailable" });
  }
});
