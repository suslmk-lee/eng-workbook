// 영어 단어 뜻 찾기에서 클라이언트·서버가 함께 쓰는 규칙

export const MAX_LOOKUP_WORDS = 20; // 한 번에 찾는 최대 단어 수
export const MAX_ENGLISH_LENGTH = 40;

// 비교·캐시용 정규화: 소문자, 앞뒤 공백·문장부호 제거, 공백 하나로, 굽은 따옴표 → '
export function normalizeEnglish(s: string): string {
  return s
    .replace(/[’‘`]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[^a-z]+|[^a-z]+$/g, "")
    .trim();
}

// 뜻을 찾을 수 있는 영어: 알파벳·공백·하이픈·아포스트로피만, 4단어 이하
export function isLookupableEnglish(normalized: string): boolean {
  return (
    normalized.length >= 1 &&
    normalized.length <= MAX_ENGLISH_LENGTH &&
    /^[a-z]([a-z' -]*[a-z])?$/.test(normalized) &&
    normalized.split(" ").length <= 4
  );
}

// AI가 돌려준 뜻 정리: 한글이 있어야 하고, 줄바꿈·따옴표 등은 제거, 30자 이하
export function cleanKoreanMeaning(s: unknown): string {
  if (typeof s !== "string") return "";
  const cleaned = s
    .replace(/[\r\n\t"“”]/g, " ")
    .replace(/[^가-힣ㄱ-ㅎㅏ-ㅣ0-9a-zA-Z ,·~()\-/]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!/[가-힣]/.test(cleaned) || cleaned.length > 30) return "";
  return cleaned;
}
