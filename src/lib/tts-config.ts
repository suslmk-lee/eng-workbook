// 클라이언트와 서버가 동일한 캐시 키를 생성하기 위한 공유 설정.
// voice/model을 바꾸면 캐시가 분리되므로 기존 파일과 충돌하지 않습니다.

export const TTS_VOICE = "nova"; // 밝고 또렷한 여성 음성 (어린이 학습에 적합)
export const TTS_MODEL = "tts-1-hd"; // 고품질. speed 파라미터 지원
export const TTS_CACHE_VERSION = "v1";
export const TTS_BUCKET = "tts";

export function clampSpeed(rate: number): number {
  if (!rate || Number.isNaN(rate)) return 0.8;
  return Math.min(4, Math.max(0.25, rate));
}

// Storage object 경로. 단어 집합이 작으므로 텍스트 슬러그 기반 키로 충분합니다.
export function ttsObjectKey(text: string, speed: number): string {
  const slug =
    text
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "word";
  const speedTag = clampSpeed(speed).toFixed(2).replace(".", "");
  return `${TTS_CACHE_VERSION}/${TTS_MODEL}_${TTS_VOICE}_${speedTag}_${slug}.mp3`;
}
