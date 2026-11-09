export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ============ 날짜 ============
// 날짜는 모두 "기기 현지 시간" 기준으로 다룬다 (한국이면 KST).
// toISOString()은 UTC라서, 한국에서는 오전 9시 전에 날짜가 하루 전으로 밀린다.

/** Date → 현지 기준 "YYYY-MM-DD" */
export function toLocalDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "YYYY-MM-DD" → 현지 0시. new Date("YYYY-MM-DD")는 UTC 0시로 해석되므로 쓰지 않는다. */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** 오늘(현지) 0시에서 days일 더한 시각. localMidnight(1) = 내일 0시 */
export function localMidnight(days = 0): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

function toDate(dateStr: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? parseLocalDate(dateStr) : new Date(dateStr);
}

export function formatDate(dateStr: string): string {
  return toDate(dateStr).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatDateShort(dateStr: string): string {
  return toDate(dateStr).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
}

export function isToday(dateStr: string): boolean {
  return dateStr === toLocalDateString();
}

export function getTodayString(): string {
  return toLocalDateString();
}

export function scrambleWord(word: string): string[] {
  const letters = word.split("");
  let scrambled = shuffleArray(letters);
  // 원본과 같으면 다시 섞기
  while (scrambled.join("") === word && word.length > 1) {
    scrambled = shuffleArray(letters);
  }
  return scrambled;
}

export function getAccuracyColor(accuracy: number): string {
  if (accuracy >= 90) return "text-green-600";
  if (accuracy >= 70) return "text-yellow-600";
  if (accuracy >= 50) return "text-orange-600";
  return "text-red-600";
}

export function getAccuracyEmoji(accuracy: number): string {
  if (accuracy >= 90) return "🌟";
  if (accuracy >= 70) return "👍";
  if (accuracy >= 50) return "💪";
  return "📚";
}

export function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(" ");
}
