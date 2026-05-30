export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
}

export function isToday(dateStr: string): boolean {
  const today = new Date().toISOString().split("T")[0];
  return dateStr === today;
}

export function getTodayString(): string {
  return new Date().toISOString().split("T")[0];
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
