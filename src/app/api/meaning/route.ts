import { NextResponse } from "next/server";
import { getRequestUserId } from "@/lib/server-auth";
import { allowRequest } from "@/lib/rate-limit";
import { MAX_LOOKUP_WORDS, cleanKoreanMeaning, isLookupableEnglish, normalizeEnglish } from "@/lib/meaning";

export const runtime = "nodejs";

// 영어 단어 → 초등학생용 한국어 뜻. 공용 사전에 없는 단어만 클라이언트가 보낸다.
// OpenAI에는 영어 단어 글자만 보내고, 사용자 정보는 보내지 않는다.
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
// 모델이 단종되면 환경 변수로 바꿀 수 있게 (Vercel > Settings > Environment Variables)
const MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-5.4-mini";

// OpenAI 호출(캐시 미스)만 사용자별로 제한. 부모가 숙제를 넣는 정상 사용량보다 넉넉하게.
const LOOKUP_LIMIT = 30;
const LOOKUP_WINDOW_MS = 10 * 60 * 1000;

// 서버 인스턴스 메모리 캐시 (같은 단어를 여러 가족이 넣을 때 재호출 방지)
const cache = new Map<string, string>();
const CACHE_MAX = 5000;

const SYSTEM_PROMPT = `You write Korean glosses of English vocabulary for Korean elementary school students (ages 7-13).
For each input word or short phrase, give its most common Korean meaning, like a children's word list.
Rules:
- At most 2 meanings, separated by ", ". Each meaning is short (10 Korean characters or fewer).
- Nouns as nouns (apple → 사과), verbs in the -다 form (run → 달리다), adjectives in the modifier form (happy → 행복한).
- Translate a phrase as a whole (get up → 일어나다, look at → ~을 보다).
- Plurals use the singular meaning (apples → 사과). Past tense keeps the past meaning (went → 갔다).
- If the input is not a real English word or phrase (typo or OCR noise), use an empty string.
- No romanization, no explanations, no English in the meaning.
Return only JSON: {"meanings": {"<input exactly as given>": "<Korean meaning>"}} with every input as a key.`;

function remember(word: string, meaning: string) {
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(word, meaning);
}

// 기능 사용 가능 여부 (키가 없으면 클라이언트는 사전에 있는 단어만 채운다)
export async function GET() {
  return NextResponse.json({ enabled: Boolean(OPENAI_API_KEY) });
}

export async function POST(req: Request) {
  if (!OPENAI_API_KEY) {
    return NextResponse.json({ error: "meaning lookup not configured" }, { status: 503 });
  }
  const userId = await getRequestUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "login required" }, { status: 401 });
  }

  let body: { words?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!Array.isArray(body.words) || body.words.length === 0 || body.words.length > MAX_LOOKUP_WORDS) {
    return NextResponse.json({ error: "invalid words" }, { status: 400 });
  }
  const words = Array.from(
    new Set(body.words.map((w) => (typeof w === "string" ? normalizeEnglish(w) : "")))
  );
  if (!words.every(isLookupableEnglish)) {
    return NextResponse.json({ error: "invalid words" }, { status: 400 });
  }

  const meanings: Record<string, string> = {};
  const misses: string[] = [];
  for (const w of words) {
    const hit = cache.get(w);
    if (hit !== undefined) meanings[w] = hit;
    else misses.push(w);
  }
  if (misses.length === 0) return NextResponse.json({ meanings });

  if (!allowRequest(`meaning:${userId}`, LOOKUP_LIMIT, LOOKUP_WINDOW_MS)) {
    return NextResponse.json({ error: "too many requests", meanings }, { status: 429 });
  }

  try {
    const res = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify({ words: misses }) },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 2000,
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 500);
      console.error("meaning lookup failed", res.status, detail);
      return NextResponse.json({ error: "lookup failed", meanings }, { status: 502 });
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    const parsed = JSON.parse(typeof content === "string" ? content : "{}");
    const found: Record<string, unknown> = parsed?.meanings ?? {};
    // 키를 다시 정규화해 맞춘다 (모델이 대소문자를 바꿔 돌려주는 경우)
    const byKey = new Map(Object.entries(found).map(([k, v]) => [normalizeEnglish(k), v]));
    for (const w of misses) {
      const meaning = cleanKoreanMeaning(byKey.get(w));
      meanings[w] = meaning;
      if (meaning) remember(w, meaning);
    }
  } catch (e) {
    console.error("meaning lookup error", e);
    return NextResponse.json({ error: "lookup error", meanings }, { status: 502 });
  }

  return NextResponse.json({ meanings });
}
