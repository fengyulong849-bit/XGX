import {
  consumeRateLimit,
  generateRecoveryCode,
  hashRecoveryCode,
  isUuid,
  isValidAccount,
  isValidPassword,
  normalizeAccount,
  normalizeRecoveryCode,
  serviceClient,
  verifyRecoveryCode,
} from "../_shared/auth.ts";
import { json, options, readJson } from "../_shared/http.ts";

Deno.serve(async (request) => {
  const preflight = options(request);
  if (preflight) return preflight;
  if (request.method !== "POST") return json(request, 405, { ok: false, reason: "method_not_allowed" });

  const body = await readJson(request);
  const account = normalizeAccount(body?.account);
  const recoveryCode = normalizeRecoveryCode(body?.recovery_code);
  const newPassword = body?.new_password;
  const requestId = body?.request_id;
  if (!isValidAccount(account) || !recoveryCode || !isValidPassword(newPassword) || !isUuid(requestId)) {
    return json(request, 400, { ok: false, reason: "invalid_recovery" });
  }

  try {
    const admin = serviceClient();
    const rate = await consumeRateLimit(admin, "auth.reset", account, request, 5, 900);
    if (!rate.allowed) return json(request, 429, { ok: false, reason: "rate_limited", retry_after_seconds: rate.retryAfterSeconds });

    const { data: recoveryRows, error: lookupError } = await admin.rpc("m1_lookup_recovery_code", { p_account: account });
    const recovery = Array.isArray(recoveryRows) ? recoveryRows[0] : null;
    if (lookupError || !recovery?.code_hash) {
      console.warn("auth-reset-password rejected recovery lookup", {
        account,
        lookup_error: Boolean(lookupError),
        recovery_record_found: Boolean(recovery),
      });
      return json(request, 401, { ok: false, reason: "invalid_recovery" });
    }

    if (!await verifyRecoveryCode(recoveryCode, recovery.code_hash)) {
      console.warn("auth-reset-password rejected recovery hash", { account });
      return json(request, 401, { ok: false, reason: "invalid_recovery" });
    }

    const { data: reservations, error: reservationError } = await admin.rpc("m1_reserve_recovery_reset", {
      p_recovery_code_id: recovery.recovery_code_id,
    });
    const reservation = Array.isArray(reservations) ? reservations[0] : null;
    if (reservationError || !reservation?.reset_id || !reservation?.user_id) {
      console.warn("auth-reset-password rejected recovery reservation", {
        account,
        reservation_error: Boolean(reservationError),
        reservation_found: Boolean(reservation),
      });
      return json(request, 401, { ok: false, reason: "invalid_recovery" });
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(reservation.user_id, { password: newPassword });
    if (updateError) return json(request, 503, { ok: false, reason: "password_reset_failed" });

    const nextRecoveryCode = generateRecoveryCode();
    const { data: completed, error: completeError } = await admin.rpc("m1_complete_recovery_reset", {
      p_reset_id: reservation.reset_id,
      p_new_code_hash: await hashRecoveryCode(nextRecoveryCode),
    });
    if (completeError || completed !== true) {
      // 密码已更新但恢复码轮换未完成：不返回新码，避免给出不可靠凭证；由运维审计处理。
      return json(request, 503, { ok: false, reason: "recovery_rotation_failed" });
    }

    return json(request, 200, { ok: true, recovery_code: nextRecoveryCode, request_id: requestId });
  } catch {
    return json(request, 503, { ok: false, reason: "service_unavailable" });
  }
});
