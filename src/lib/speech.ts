import { TTS_BUCKET, clampSpeed, ttsObjectKey } from "./tts-config";
import { supabase } from "./supabase";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

// ============ 클라우드 TTS (OpenAI) + Storage 캐싱 ============
// 재생 전략:
//  1) 캐시 키로 만든 Supabase Storage public URL을 직접 재생 시도 (CDN 히트 → 서버 호출 0)
//  2) 404면 /api/tts 호출 → OpenAI 생성 + Storage 저장 후 재생
//  3) 모두 실패하면 브라우저 내장 Web Speech로 폴백 (키 미설정 환경도 동작)

let currentAudio: HTMLAudioElement | null = null;

// ============ 발음 방식 사용자 설정 ============
// cloud: OpenAI 고품질 음성 (인터넷, 첫 재생 지연 가능) / device: 기기 내장 음성 (즉시)
export type TtsMode = "cloud" | "device";

const TTS_MODE_KEY = "ew_tts_mode";

export function getTtsMode(): TtsMode {
  if (typeof window === "undefined") return "cloud";
  try {
    return localStorage.getItem(TTS_MODE_KEY) === "device" ? "device" : "cloud";
  } catch {
    return "cloud";
  }
}

export function setTtsMode(mode: TtsMode): void {
  try {
    localStorage.setItem(TTS_MODE_KEY, mode);
  } catch {}
}

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
  if (getTtsMode() === "device") {
    speakWithWebSpeech(word, speed);
    return;
  }
  void playCloud(word, speed);
}

// 서버가 mp3를 직접 응답하는 경우(Storage 캐싱 미설정)를 위한 세션 메모리 캐시.
// 같은 단어를 반복 재생할 때 OpenAI 재호출을 막습니다.
const blobUrlCache = new Map<string, string>();

async function playCloud(text: string, speed: number): Promise<void> {
  const key = ttsObjectKey(text, speed);

  // 0) 세션 메모리 캐시 히트
  const blobUrl = blobUrlCache.get(key);
  if (blobUrl) {
    try {
      await playUrl(blobUrl);
      return;
    } catch {
      blobUrlCache.delete(key);
    }
  }

  // 1) Storage 캐시 히트 시도 (Supabase URL이 있을 때만)
  if (SUPABASE_URL) {
    try {
      await playUrl(publicUrl(key));
      return;
    } catch {
      // 캐시 미스 → 생성 단계로
    }
  }

  // 2) 서버에서 생성 (로그인 토큰 필요, 없으면 바로 폴백)
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw new Error("not signed in");

    const res = await fetch("/api/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ text, speed }),
    });
    if (!res.ok) throw new Error(`tts api ${res.status}`);

    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("audio")) {
      // 캐싱 미설정 서버 → mp3 바이트 직접 수신
      const url = URL.createObjectURL(await res.blob());
      blobUrlCache.set(key, url);
      await playUrl(url);
      return;
    }

    const data = (await res.json()) as { url?: string };
    if (!data.url) throw new Error("tts api: no url");
    await playUrl(data.url);
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

// ============ 음성 인식 (말하기 모듈) ============
// 브라우저 내장 음성 인식. 크롬·사파리에서 동작하고 파이어폭스 등은 지원하지 않아 null
export function createSpeechRecognition(): any | null {
  if (typeof window === "undefined") return null;
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) return null;
  const recognition = new SR();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 5;
  return recognition;
}

export function speechRecognitionErrorMessage(error: string): string {
  if (error === "not-allowed" || error === "service-not-allowed") return "마이크 사용을 허용해주세요 (브라우저 설정)";
  if (error === "no-speech") return "소리가 들리지 않았어요. 다시 눌러서 크게 말해보세요!";
  return "음성 인식에 실패했어요. 다시 시도해주세요.";
}
