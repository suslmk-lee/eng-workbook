// 사진 글자 인식(OCR) 결과에서 단어 목록 뽑기.
// 화면·라이브러리와 무관한 순수 함수라 따로 시험할 수 있다.
//
// 처리하는 모양
//   apple 사과 / 1. apple 사과 / ① apple - 사과 / apple: 사과
//   get up 일어나다 (여러 단어로 된 표현, 4단어까지)
//   apple 사과      banana 바나나   (한 줄에 두 칸 이상: 띄어쓰기가 넓으면 다른 단어)
//   영어만 있는 목록 (뜻은 나중에 자동으로 채움)

export interface OcrBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export interface OcrSymbol {
  text: string;
  bbox: OcrBox;
}
export interface OcrWord {
  text: string;
  confidence: number; // 0~100
  bbox: OcrBox;
  symbols?: OcrSymbol[]; // 글자별 위치 (붙어 나온 단어를 나눌 때 씀)
}
export interface OcrLine {
  words: OcrWord[];
}

export interface DetectedWord {
  english: string;
  korean: string; // 교재에서 함께 읽은 뜻 (없으면 "")
  confidence: number; // 영어 부분 평균 인식 확신도
  likely: boolean; // 단어로 보여 기본으로 선택해 둘지
}

const MIN_TOKEN_CONFIDENCE = 45; // 이보다 낮으면 잡음으로 보고 버림
const LIKELY_CONFIDENCE = 70;
const MAX_PHRASE_WORDS = 4;
// 글자 사이 간격이 글자 높이의 30%를 넘으면 띄어쓰기로 본다
// (인식기가 "3. get up"을 "3.getup" 한 덩어리로, 한글은 "일 어 나 다"처럼 글자마다 나눠 주는 경우가 있음)
const SPACE_GAP_RATIO = 0.3;
// 한글은 글자 사이가 조금 더 벌어져 나온다. 낱말 사이 띄어쓰기는 글자 높이의 절반쯤
const KOREAN_JOIN_RATIO = 0.4;
const HANGUL = /[가-힣]/;
const NUMBERING = /^([(\[]?\d{1,3}[.)\]:,]?|[①-⑳]|[•·▪◦*\-–—:=>→])$/;
const LEADING_NUMBER = /^[(\[]?\d{1,3}[.)\]:]+(?=[A-Za-z])/; // "1.apple" 처럼 붙은 번호
// 단어장 머리말에 자주 나오는 말: 보여 주되 기본 선택은 하지 않는다
const HEADER_WORDS = new Set(["unit", "lesson", "day", "week", "words", "word", "test", "name", "date", "score", "page", "chapter", "part", "review", "quiz", "vocabulary"]);

type Kind = "english" | "korean" | "number" | "noise";

function classify(w: OcrWord): { kind: Kind; text: string } {
  const raw = w.text.trim();
  if (!raw) return { kind: "noise", text: "" };
  if (NUMBERING.test(raw)) return { kind: "number", text: raw };
  if (HANGUL.test(raw)) return { kind: "korean", text: raw };
  const stripped = raw.replace(LEADING_NUMBER, "").replace(/[’‘`]/g, "'").replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");
  if (stripped && /^[A-Za-z][A-Za-z'-]*$/.test(stripped) && w.confidence >= MIN_TOKEN_CONFIDENCE) {
    return { kind: "english", text: stripped };
  }
  return { kind: "noise", text: raw };
}

// 한 덩어리로 나온 단어 안에 띄어쓰기만큼 벌어진 곳이 있으면 나눈다
function splitAtGaps(w: OcrWord): OcrWord[] {
  const syms = w.symbols?.filter((s) => s.text) ?? [];
  if (syms.length < 2) return [w];
  const limit = (w.bbox.y1 - w.bbox.y0) * SPACE_GAP_RATIO;
  const groups: OcrSymbol[][] = [[syms[0]]];
  for (let i = 1; i < syms.length; i++) {
    if (syms[i].bbox.x0 - syms[i - 1].bbox.x1 > limit) groups.push([]);
    groups[groups.length - 1].push(syms[i]);
  }
  if (groups.length === 1) return [w];
  return groups.map((g) => ({
    text: g.map((s) => s.text).join(""),
    confidence: w.confidence,
    bbox: {
      x0: Math.min(...g.map((s) => s.bbox.x0)),
      y0: w.bbox.y0,
      x1: Math.max(...g.map((s) => s.bbox.x1)),
      y1: w.bbox.y1,
    },
  }));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function cleanKorean(parts: string[]): string {
  return parts
    .join(" ")
    .replace(/[^가-힣0-9 ,·~()\-/]/g, "")
    .replace(/^[\s\-:,·~/]+|[\s\-:,·~/]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeWord(english: string): boolean {
  const letters = english.replace(/[^A-Za-z]/g, "");
  if (letters.length < 2) return false;
  if (!/[aeiouy]/i.test(letters)) return false;
  if (/([a-z])\1\1/i.test(letters)) return false; // 같은 글자 3번 연속은 인식 잡음
  if (/[bcdfghjklmnpqrstvwxz]{5,}/i.test(letters)) return false;
  return true;
}

// 모두 대문자면 소문자로 (APPLE → apple). "I"나 한 글자는 그대로
function normalizeCase(english: string): string {
  return english.length > 1 && english === english.toUpperCase() ? english.toLowerCase() : english;
}

export function extractWordPairs(lines: OcrLine[], readKorean: boolean): DetectedWord[] {
  const results: DetectedWord[] = [];

  for (const line of lines) {
    const words = line.words.filter((w) => w.text.trim()).flatMap(splitAtGaps);
    const lineHeight = median(words.map((w) => w.bbox.y1 - w.bbox.y0)) || 20;

    let eng: OcrWord[] = [];
    let engText: string[] = [];
    let kor: string[] = [];
    let lastX1 = 0;

    const finish = () => {
      if (engText.length > 0) {
        const english = normalizeCase(engText.join(" "));
        const confidence = Math.round(eng.reduce((s, w) => s + w.confidence, 0) / eng.length);
        const isHeader = engText.length === 1 && HEADER_WORDS.has(engText[0].toLowerCase());
        if (looksLikeWord(english) || english === "I") {
          results.push({
            english,
            korean: readKorean ? cleanKorean(kor) : "",
            confidence,
            likely: confidence >= LIKELY_CONFIDENCE && !isHeader && looksLikeWord(english),
          });
        }
      }
      eng = [];
      engText = [];
      kor = [];
    };

    for (const w of words) {
      const { kind, text } = classify(w);
      if (kind === "english") {
        const gap = w.bbox.x0 - lastX1;
        // 앞 단어의 뜻까지 읽었거나, 간격이 넓거나(다른 칸), 표현이 너무 길면 새 단어
        if (kor.length > 0 || (engText.length > 0 && (gap > lineHeight * 1.2 || engText.length >= MAX_PHRASE_WORDS))) {
          finish();
        }
        eng.push(w);
        engText.push(text);
      } else if (kind === "korean") {
        if (engText.length > 0) {
          // 바로 붙어 있는 한글 조각은 한 낱말로 (일 어 나 다 → 일어나다)
          const gap = w.bbox.x0 - lastX1;
          if (kor.length > 0 && gap < lineHeight * KOREAN_JOIN_RATIO && HANGUL.test(kor[kor.length - 1])) {
            kor[kor.length - 1] += text;
          } else {
            kor.push(text);
          }
        }
      } else {
        // 번호·기호·잡음: 지금까지 읽은 단어를 마무리 (뜻 사이의 쉼표·물결 등은 뜻에 붙여 둠)
        if (kind === "noise" && kor.length > 0 && /^[,~·()\-/]+$/.test(text)) {
          kor.push(text);
        } else if (kind === "number" && kor.length === 0 && engText.length > 0 && /^[\-–—:=>→]$/.test(text)) {
          // "apple - 사과" 의 구분 기호: 뜻이 이어서 나온다
        } else {
          finish();
        }
      }
      lastX1 = w.bbox.x1;
    }
    finish();
  }

  // 같은 단어는 하나만 (먼저 나온 것, 뜻이 있으면 뜻 있는 것)
  const seen = new Map<string, number>();
  const unique: DetectedWord[] = [];
  for (const r of results) {
    const key = r.english.toLowerCase();
    const at = seen.get(key);
    if (at === undefined) {
      seen.set(key, unique.length);
      unique.push(r);
    } else if (!unique[at].korean && r.korean) {
      unique[at] = { ...r, likely: unique[at].likely || r.likely };
    }
  }
  return unique;
}
