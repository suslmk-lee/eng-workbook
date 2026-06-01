import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { TTS_BUCKET, TTS_MODEL, TTS_VOICE, clampSpeed, ttsObjectKey } from "@/lib/tts-config";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const MAX_TEXT_LENGTH = 200;

function publicUrl(key: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${TTS_BUCKET}/${key}`;
}

export async function POST(req: Request) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !OPENAI_API_KEY) {
    // 키 미설정 → 클라이언트가 Web Speech로 폴백하도록 503
    return NextResponse.json({ error: "TTS not configured" }, { status: 503 });
  }

  let body: { text?: unknown; speed?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text || text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ error: "invalid text" }, { status: 400 });
  }
  const speed = clampSpeed(typeof body.speed === "number" ? body.speed : 0.8);

  const key = ttsObjectKey(text, speed);
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // 이미 캐시에 있으면 OpenAI 호출 없이 바로 반환 (비용 절감)
  const { data: existing } = await supabase.storage
    .from(TTS_BUCKET)
    .list(key.split("/")[0], { search: key.split("/").pop() });
  if (existing?.some((f) => f.name === key.split("/").pop())) {
    return NextResponse.json({ url: publicUrl(key), cached: true });
  }

  // OpenAI TTS 생성
  let audioBuffer: ArrayBuffer;
  try {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: TTS_MODEL,
        voice: TTS_VOICE,
        input: text,
        response_format: "mp3",
        speed,
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json({ error: "openai failed", detail }, { status: 502 });
    }
    audioBuffer = await res.arrayBuffer();
  } catch (e) {
    return NextResponse.json({ error: "openai request error" }, { status: 502 });
  }

  // Storage에 캐싱
  const { error: uploadError } = await supabase.storage
    .from(TTS_BUCKET)
    .upload(key, Buffer.from(audioBuffer), {
      contentType: "audio/mpeg",
      upsert: true,
      cacheControl: "31536000", // 1년
    });
  if (uploadError) {
    return NextResponse.json({ error: "upload failed", detail: uploadError.message }, { status: 500 });
  }

  return NextResponse.json({ url: publicUrl(key), cached: false });
}
