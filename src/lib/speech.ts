import { TTS_BUCKET, clampSpeed, ttsObjectKey } from "./tts-config";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

// ============ 클라우드 TTS (OpenAI) + Storage 캐싱 ============
// 재생 전략:
//  1) 캐시 키로 만든 Supabase Storage public URL을 직접 재생 시도 (CDN 히트 → 서버 호출 0)
//  2) 404면 /api/tts 호출 → OpenAI 생성 + Storage 저장 후 재생
//  3) 모두 실패하면 브라우저 내장 Web Speech로 폴백 (키 미설정 환경도 동작)

let currentAudio: HTMLAudioElement | null = null;

function publicUrl(key: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${TTS_BUCKET}/${key}`;
}

function stopAll(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

function playUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    currentAudio = audio;
    audio.onended = () => {
      if (currentAudio === audio) currentAudio = null;
      resolve();
    };
    audio.onerror = () => reject(new Error("audio load failed"));
    audio.play().then(undefined, reject);
  });
}

export function speakEnglish(text: string, rate: number = 0.8): void {
  if (typeof window === "undefined") return;
  const word = text?.trim();
  if (!word) return;

  const speed = clampSpeed(rate);
  stopAll();
  void playCloud(word, speed);
}

async function playCloud(text: string, speed: number): Promise<void> {
  // Supabase URL이 없으면 바로 폴백
  if (!SUPABASE_URL) {
    speakWithWebSpeech(text, speed);
    return;
  }

  const cachedUrl = publicUrl(ttsObjectKey(text, speed));

  // 1) 캐시 히트 시도
  try {
    await playUrl(cachedUrl);
    return;
  } catch {
    // 캐시 미스 → 생성 단계로
  }

  // 2) 서버에서 생성
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, speed }),
    });
    if (!res.ok) throw new Error(`tts api ${res.status}`);
    const data = (await res.json()) as { url?: string };
    await playUrl(data.url || cachedUrl);
    return;
  } catch {
    // 3) 최종 폴백
    speakWithWebSpeech(text, speed);
  }
}

// ============ Web Speech 폴백 ============

const FEMALE_VOICE_KEYWORDS = [
  "Female",
  "Samantha",
  "Victoria",
  "Karen",
  "Kate",
  "Serena",
  "Zira",
  "Google US English",
  "Tessa",
  "Frederica",
  "Joanna",
  "Kendra",
  "Kimberly",
  "Salli",
  "Amy",
  "Emma",
];

function isFemaleVoice(voice: SpeechSynthesisVoice): boolean {
  const name = voice.name.toLowerCase();
  if (name.includes("male") || name.includes("daniel") || name.includes("fred") || name.includes("bruce")) {
    return false;
  }
  return FEMALE_VOICE_KEYWORDS.some((keyword) => name.includes(keyword.toLowerCase()));
}

function speakWithWebSpeech(text: string, rate: number): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = rate;
  utterance.pitch = 1.1;
  utterance.volume = 1;

  const voices = window.speechSynthesis.getVoices();
  let englishVoice = voices.find((v) => v.lang.startsWith("en") && isFemaleVoice(v));

  if (!englishVoice) {
    englishVoice = voices.find(
      (v) => v.lang.startsWith("en") && (v.name.includes("Samantha") || v.name.includes("Google US"))
    );
  }

  if (!englishVoice) {
    englishVoice = voices.find((v) => v.lang.startsWith("en"));
  }

  if (englishVoice) {
    utterance.voice = englishVoice;
  }

  window.speechSynthesis.speak(utterance);
}

export function initVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      resolve([]);
      return;
    }
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve(voices);
      return;
    }
    window.speechSynthesis.onvoiceschanged = () => {
      resolve(window.speechSynthesis.getVoices());
    };
  });
}
