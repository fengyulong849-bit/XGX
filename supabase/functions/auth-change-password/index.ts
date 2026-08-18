import {
  anonClient,
  generateRecoveryCode,
  hashRecoveryCode,
  isValidPassword,
  serviceClient,
} from "../_shared/auth.ts";
import { json, options, readJson } from "../_shared/http.ts";

Deno.serve(async (request) => {
  const preflight = options(request);
  if (preflight) return preflight;
  if (request.method !== "POST") return json(request, 405, { ok: false, reason: "method_not_allowed" });

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const body = await readJson(request);
  const currentPassword = body?.current_password;
  const newPassword = body?.new_password;
  if (!token || !isValidPassword(currentPassword) || !isValidPassword(newPassword)) {
    return json(request, 400, { ok: false, reason: "invalid_input" });
  }

  try {
    const admin = serviceClient();
    const { data: identity, error: identityError } = await admin.auth.getUser(token);
    if (identityError || !identity.user) return json(request, 401, { ok: false, reason: "invalid_session" });

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

    const update = await admin.auth.admin.updateUserById(identity.user.id, { password: newPassword });
    if (update.error) return json(request, 503, { ok: false, reason: "password_change_failed" });

    const nextRecoveryCode = generateRecoveryCode();
    const completed = await admin.rpc("m1_rotate_recovery_after_password_change", {
      p_user_id: identity.user.id,
      p_new_code_hash: await hashRecoveryCode(nextRecoveryCode),
    });
    if (completed.error || completed.data !== true) return json(request, 503, { ok: false, reason: "recovery_rotation_failed" });

    return json(request, 200, { ok: true, recovery_code: nextRecoveryCode });
  } catch {
    return json(request, 503, { ok: false, reason: "service_unavailable" });
  }
});
