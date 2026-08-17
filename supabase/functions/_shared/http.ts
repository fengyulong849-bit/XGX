import type { JsonRecord } from "./auth.ts";

function originFor(request: Request): string {
  const configured = Deno.env.get("XQX_ALLOWED_ORIGINS")
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];
  const origin = request.headers.get("origin") ?? "";
  // 未配置时仅用于 xqx-dev 联调；部署生产前必须配置明确的 HTTPS 域名白名单。
  if (configured.length === 0) return "*";
  return configured.includes(origin) ? origin : "null";
}

export function corsHeaders(request: Request): HeadersInit {
  return {
    "Access-Control-Allow-Origin": originFor(request),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
  };
}

export function json(request: Request, status: number, body: JsonRecord): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(request) });
}

export async function readJson(request: Request): Promise<JsonRecord | null> {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
  } catch {
    return null;
  }
}

export function options(request: Request): Response | null {
  return request.method === "OPTIONS" ? new Response("ok", { headers: corsHeaders(request) }) : null;
}
