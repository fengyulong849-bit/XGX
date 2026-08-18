import { serviceClient } from "../_shared/auth.ts";
import { json, options } from "../_shared/http.ts";

Deno.serve(async (request) => {
  const preflight = options(request);
  if (preflight) return preflight;
  if (request.method !== "GET") return json(request, 405, { ok: false, reason: "method_not_allowed" });
  try {
    const url = new URL(request.url);
    const limit = Math.min(20, Math.max(1, Number(url.searchParams.get("limit") || 10)));
    const admin = serviceClient();
    const { data, error } = await admin.from("rants").select("id,content,votes,created_at,expires_at").eq("status", "published").eq("review_status", "approved").gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(100);
    if (error) return json(request, 503, { ok: false, reason: "service_unavailable" });
    const rows = [...(data || [])].sort(() => Math.random() - 0.5).slice(0, limit);
    return json(request, 200, { ok: true, rants: rows });
  } catch { return json(request, 503, { ok: false, reason: "service_unavailable" }); }
});
