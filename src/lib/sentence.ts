// 문장 학습 공통 도구: 사전 예문에서 학습 문제를 만든다
import { Word } from "./types";
import { shuffleArray } from "./utils";

export interface SentenceItem {
  word: Word;          // 대상 단어 (학습 기록은 이 단어로 저장)
  sentence: string;    // 영어 예문
  translation: string; // 한국어 해석
  tokens: string[];    // 띄어쓰기 단위 (문장부호는 붙은 채로)
  targetIndex: number; // 예문에서 대상 단어 위치
}

export function tokenize(sentence: string): string[] {
  return sentence.trim().split(/\s+/);
}

// 비교용: 소문자, 영문자만 (아포스트로피 제거: let's == lets)
const letters = (t: string) => t.toLowerCase().replace(/[^a-z]/g, "");

// 예문에서 대상 단어 위치. 그대로 → 활용형(-s, -es, -ed, -ing, y→ies) → 어간으로 시작 순서로 찾는다
export function findTargetIndex(tokens: string[], english: string): number {
  const base = letters(english);
  const words = tokens.map(letters);
  const exact = words.indexOf(base);
  if (exact >= 0) return exact;
  const stem = base.length > 3 ? base.replace(/(e|y)$/, "") : base;
  const forms = new Set([
    base + "s", base + "es", base + "ed", base + "d", base + "ing",
    stem + "ies", stem + "ied", stem + "ing", stem + "ed",
  ]);
  const inflected = words.findIndex((w) => forms.has(w));
  if (inflected >= 0) return inflected;
  return stem.length >= 3 ? words.findIndex((w) => w.startsWith(stem)) : -1;
}

// 세트의 단어 중 예문이 있는 것으로 문제 목록 (섞어서 최대 max개)
export function buildSentenceItems(
  words: Word[],
  max = 10,
  filter?: (item: SentenceItem) => boolean
): SentenceItem[] {
  const items: SentenceItem[] = [];
  for (const word of words) {
    const ex = word.dictionary_words;
    if (!ex?.example_en) continue;
    const tokens = tokenize(ex.example_en);
    const targetIndex = findTargetIndex(tokens, word.english);
    if (targetIndex < 0) continue;
    const item = { word, sentence: ex.example_en, translation: ex.example_ko, tokens, targetIndex };
    if (!filter || filter(item)) items.push(item);
  }
  return shuffleArray(items).slice(0, max);
}

// 빈칸 문장: 대상 단어의 글자 부분만 ____ 로 (문장부호는 남김)
export function blankSentence(item: SentenceItem): string {
  return item.tokens
    .map((t, i) => (i === item.targetIndex ? t.replace(/[A-Za-z']+/, "____") : t))
    .join(" ");
}

// 말한 문장이 예문과 얼마나 같은지 (단어 순서를 지킨 일치 단어 수 / 예문 단어 수)
export function spokenMatchRatio(target: string, spoken: string): number {
  const norm = (s: string) => s.split(/\s+/).map(letters).filter(Boolean);
  const t = norm(target);
  const h = norm(spoken);
  if (t.length === 0) return 0;
  const dp = Array.from({ length: t.length + 1 }, () => new Array<number>(h.length + 1).fill(0));
  for (let i = 1; i <= t.length; i++) {
    for (let j = 1; j <= h.length; j++) {
      dp[i][j] = t[i - 1] === h[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[t.length][h.length] / t.length;
}

export const SPOKEN_PASS_RATIO = 0.7;
