// 알파벳 익히기: 글자마다 예시 단어(그림 이모지)와 문제 고르기
import { shuffleArray } from "./utils";

export interface LetterInfo {
  letter: string; // 대문자
  word: string;
  emoji: string;
  korean: string;
  firstLetter: boolean; // 단어가 이 글자로 시작하는지 (X는 끝 글자: box)
}

export const LETTERS: LetterInfo[] = [
  { letter: "A", word: "apple", emoji: "🍎", korean: "사과", firstLetter: true },
  { letter: "B", word: "bear", emoji: "🐻", korean: "곰", firstLetter: true },
  { letter: "C", word: "cat", emoji: "🐱", korean: "고양이", firstLetter: true },
  { letter: "D", word: "dog", emoji: "🐶", korean: "개", firstLetter: true },
  { letter: "E", word: "egg", emoji: "🥚", korean: "달걀", firstLetter: true },
  { letter: "F", word: "fish", emoji: "🐟", korean: "물고기", firstLetter: true },
  { letter: "G", word: "grape", emoji: "🍇", korean: "포도", firstLetter: true },
  { letter: "H", word: "hat", emoji: "🎩", korean: "모자", firstLetter: true },
  { letter: "I", word: "ice", emoji: "🧊", korean: "얼음", firstLetter: true },
  { letter: "J", word: "juice", emoji: "🧃", korean: "주스", firstLetter: true },
  { letter: "K", word: "kite", emoji: "🪁", korean: "연", firstLetter: true },
  { letter: "L", word: "lion", emoji: "🦁", korean: "사자", firstLetter: true },
  { letter: "M", word: "moon", emoji: "🌙", korean: "달", firstLetter: true },
  { letter: "N", word: "nose", emoji: "👃", korean: "코", firstLetter: true },
  { letter: "O", word: "orange", emoji: "🍊", korean: "오렌지", firstLetter: true },
  { letter: "P", word: "pig", emoji: "🐷", korean: "돼지", firstLetter: true },
  { letter: "Q", word: "queen", emoji: "👸", korean: "여왕", firstLetter: true },
  { letter: "R", word: "rabbit", emoji: "🐰", korean: "토끼", firstLetter: true },
  { letter: "S", word: "sun", emoji: "☀️", korean: "해", firstLetter: true },
  { letter: "T", word: "tiger", emoji: "🐯", korean: "호랑이", firstLetter: true },
  { letter: "U", word: "umbrella", emoji: "☂️", korean: "우산", firstLetter: true },
  { letter: "V", word: "violin", emoji: "🎻", korean: "바이올린", firstLetter: true },
  { letter: "W", word: "whale", emoji: "🐳", korean: "고래", firstLetter: true },
  { letter: "X", word: "box", emoji: "📦", korean: "상자", firstLetter: false },
  { letter: "Y", word: "yo-yo", emoji: "🪀", korean: "요요", firstLetter: true },
  { letter: "Z", word: "zebra", emoji: "🦓", korean: "얼룩말", firstLetter: true },
];

export const LETTER_MAP: Record<string, LetterInfo> = Object.fromEntries(LETTERS.map((l) => [l.letter, l]));

// 글자 이름 읽기용 문장 ("A."처럼 마침표를 붙여야 관사 "a"가 아니라 글자 이름으로 읽음)
export function letterSpeech(letter: string): string {
  return `${letter.toUpperCase()}.`;
}

export interface LetterProgress {
  streak: number;
  correct: number;
  mastered: boolean;
}

// 이번 판에 낼 글자: 아직 못 익힌 글자 → 연속 정답이 적은 글자 순 (같으면 무작위)
export function pickLetters(
  progress: Record<string, LetterProgress>,
  count: number,
  filter: (l: LetterInfo) => boolean = () => true
): LetterInfo[] {
  const pool = shuffleArray(LETTERS.filter(filter));
  pool.sort((a, b) => {
    const pa = progress[a.letter];
    const pb = progress[b.letter];
    return Number(pa?.mastered ?? false) - Number(pb?.mastered ?? false) || (pa?.streak ?? 0) - (pb?.streak ?? 0);
  });
  return shuffleArray(pool.slice(0, count));
}

// 정답 글자와 다른 글자 3개 (보기용)
export function distractors(answer: string, n = 3, filter: (l: LetterInfo) => boolean = () => true): string[] {
  return shuffleArray(LETTERS.filter((l) => l.letter !== answer && filter(l)).map((l) => l.letter)).slice(0, n);
}
