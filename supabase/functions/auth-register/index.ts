import {
  anonClient,
  consumeRateLimit,
  generateRecoveryCode,
  hashRecoveryCode,
  internalLoginEmail,
  isUuid,
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
  const requestId = body?.request_id;
  if (!isValidAccount(account) || !isValidPassword(password) || !isUuid(requestId)) {
    return json(request, 400, { ok: false, reason: "invalid_input" });
  }

  try {
    const admin = serviceClient();
    const rate = await consumeRateLimit(admin, "auth.register", account, request, 5, 600);
    if (!rate.allowed) return json(request, 429, { ok: false, reason: "rate_limited", retry_after_seconds: rate.retryAfterSeconds });

    const recoveryCode = generateRecoveryCode();
    const recoveryCodeHash = await hashRecoveryCode(recoveryCode);
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: internalLoginEmail(account),
      password,
      email_confirm: true,
    });

    if (createError || !created.user) {
      return json(request, 409, { ok: false, reason: "account_unavailable" });
    }

    const { data: initialized, error: initializeError } = await admin.rpc("m1_initialize_account", {
      p_user_id: created.user.id,
      p_account: account,
      p_request_id: requestId,
      p_recovery_code_hash: recoveryCodeHash,
    });

    if (initializeError || !initialized || (initialized as { ok?: boolean }).ok !== true) {
      // 账号业务初始化失败时回滚刚创建的 Auth 用户，避免残留不可登录账号。
      await admin.auth.admin.deleteUser(created.user.id);
      return json(request, 409, { ok: false, reason: "account_unavailable" });
    }

    const { data: sessionResult, error: signInError } = await anonClient().auth.signInWithPassword({
      email: internalLoginEmail(account),
      password,
    });
    if (signInError || !sessionResult.session) {
      // 不把“已创建但用户未拿到恢复码”的半成品账号留在系统中。
      await admin.auth.admin.deleteUser(created.user.id);
      return json(request, 500, { ok: false, reason: "registration_session_failed" });
    }

    const profile = initialized as { points_balance: number; free_diy_available: boolean };
    return json(request, 201, {
      ok: true,
      access_token: sessionResult.session.access_token,
      refresh_token: sessionResult.session.refresh_token,
      profile: {
        points_balance: profile.points_balance,
        free_diy_available: profile.free_diy_available,
      },
      recovery_code: recoveryCode,
    });
  } catch {
    return json(request, 503, { ok: false, reason: "service_unavailable" });
  }
});
