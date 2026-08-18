import { serviceClient } from "../_shared/auth.ts";
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

    const [{ data: profile, error: profileError }, { data: account, error: accountError }, { data: checkins, error: checkinError }] = await Promise.all([
      admin.from("profiles").select("points_balance,free_diy_available,appearance,pet_status,created_at").eq("user_id", identity.user.id).maybeSingle(),
      admin.from("account_credentials").select("account_display").eq("user_id", identity.user.id).maybeSingle(),
      admin.from("checkins").select("business_date,streak").eq("user_id", identity.user.id).order("business_date", { ascending: false }).limit(366),
    ]);
    if (profileError || accountError || checkinError || !profile) return json(request, 503, { ok: false, reason: "profile_unavailable" });

    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date()).reduce((value, part) => part.type === "literal" ? value : { ...value, [part.type]: part.value }, {} as Record<string, string>);
    const businessDate = `${today.year}-${today.month}-${today.day}`;
    const latest = checkins?.[0];
    return json(request, 200, {
      ok: true,
      profile: {
        ...profile,
        account_display: account?.account_display || "",
        signed_today: Boolean(checkins?.some((row) => row.business_date === businessDate)),
        streak: latest?.streak || 0,
        signed_dates: (checkins || []).map((row) => row.business_date),
      },
    });
  } catch { return json(request, 503, { ok: false, reason: "service_unavailable" }); }
});
