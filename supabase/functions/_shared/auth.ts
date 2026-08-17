import { createClient } from "npm:@supabase/supabase-js@2";

const textEncoder = new TextEncoder();
const PBKDF2_ITERATIONS = 310_000;
const RECOVERY_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export type JsonRecord = Record<string, unknown>;

export function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required function secret: ${name}`);
  return value;
}

export function serviceClient() {
  return createClient(
    getRequiredEnv("SUPABASE_URL"),
    getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export function anonClient() {
  return createClient(
    getRequiredEnv("SUPABASE_URL"),
    getRequiredEnv("SUPABASE_ANON_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export function normalizeAccount(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isValidAccount(account: string): boolean {
  return /^[a-z0-9_]{4,20}$/.test(account);
}

export function isValidPassword(password: unknown): password is string {
  if (typeof password !== "string" || password.length < 8 || password.length > 32) return false;
  let types = 0;
  if (/[a-zA-Z]/.test(password)) types += 1;
  if (/\d/.test(password)) types += 1;
  if (/[^a-zA-Z\d]/.test(password)) types += 1;
  return types >= 2;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function internalLoginEmail(account: string): string {
  return `${account}@accounts.xqx.invalid`;
}

export function normalizeRecoveryCode(value: unknown): string {
  if (typeof value !== "string") return "";
  const compact = value.replace(/[\s-]/g, "").toUpperCase();
  if (!/^XQX[A-Z0-9]{20}$/.test(compact)) return "";
  return `XQX-${compact.slice(3, 8)}-${compact.slice(8, 13)}-${compact.slice(13, 18)}-${compact.slice(18, 23)}`;
}

export function generateRecoveryCode(): string {
  const random = crypto.getRandomValues(new Uint8Array(20));
  let value = "XQX";
  for (const byte of random) value += RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length];
  return `XQX-${value.slice(3, 8)}-${value.slice(8, 13)}-${value.slice(13, 18)}-${value.slice(18, 23)}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function deriveRecoveryBytes(code: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const pepper = getRequiredEnv("RECOVERY_CODE_PEPPER");
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(`${code}\u0000${pepper}`),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashRecoveryCode(code: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await deriveRecoveryBytes(code, salt, PBKDF2_ITERATIONS);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(derived)}`;
}

export async function verifyRecoveryCode(code: string, encoded: string): Promise<boolean> {
  const [algorithm, iterationsText, saltText, expectedText] = encoded.split("$");
  if (algorithm !== "pbkdf2-sha256" || !iterationsText || !saltText || !expectedText) return false;
  const iterations = Number(iterationsText);
  if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > 1_000_000) return false;

  try {
    const expected = base64ToBytes(expectedText);
    const actual = await deriveRecoveryBytes(code, base64ToBytes(saltText), iterations);
    if (expected.length !== actual.length) return false;
    let difference = 0;
    for (let index = 0; index < expected.length; index += 1) difference |= expected[index] ^ actual[index];
    return difference === 0;
  } catch {
    return false;
  }
}

export async function subjectHash(scope: string, account: string, request: Request): Promise<string> {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const secret = getRequiredEnv("RATE_LIMIT_SECRET");
  const bytes = await crypto.subtle.digest("SHA-256", textEncoder.encode(`${scope}\u0000${account}\u0000${ip}\u0000${secret}`));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function consumeRateLimit(
  client: ReturnType<typeof serviceClient>,
  scope: string,
  account: string,
  request: Request,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const { data, error } = await client.rpc("m1_consume_rate_limit", {
    p_scope: scope,
    p_subject_hash: await subjectHash(scope, account, request),
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error || !data || typeof data !== "object") throw new Error("rate_limit_unavailable");
  const result = data as JsonRecord;
  return {
    allowed: result.allowed === true,
    retryAfterSeconds: typeof result.retry_after_seconds === "number" ? result.retry_after_seconds : 60,
  };
}
