// API 라우트 전용: Authorization: Bearer <Supabase access token> 검증.
// 검증 결과를 인스턴스 메모리에 잠시 캐시해, 자주 호출되는 라우트(/api/tts)가
// 매 요청마다 Supabase Auth를 왕복하지 않게 한다.
// 계정 변경처럼 민감한 작업은 캐시를 쓰지 말고 매번 검증할 것.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 1000;
const verifiedTokens = new Map<string, { userId: string; expiresAt: number }>();

function bearerToken(req: Request): string {
  return (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
}

// JWT의 exp(초)를 읽는다. 서명 검증은 getUser가 하므로 여기선 만료 시각만 참고한다.
function tokenExpiryMs(token: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

// 로그인한 사용자의 id. 토큰이 없거나 유효하지 않으면 null.
export async function getRequestUserId(req: Request): Promise<string | null> {
  if (!SUPABASE_URL || !ANON_KEY) return null;
  const token = bearerToken(req);
  if (!token) return null;

  const now = Date.now();
  const cached = verifiedTokens.get(token);
  if (cached && cached.expiresAt > now) return cached.userId;

  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data.user) return null;

  const tokenExp = tokenExpiryMs(token);
  const expiresAt = Math.min(now + CACHE_TTL_MS, tokenExp ?? now + CACHE_TTL_MS);
  if (verifiedTokens.size >= CACHE_MAX_ENTRIES) verifiedTokens.clear();
  verifiedTokens.set(token, { userId: data.user.id, expiresAt });
  return data.user.id;
}
