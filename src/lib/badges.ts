// 배지 그림·이름. 조건(지표·기준값)은 DB의 badge_catalog()에 있고 get_rewards_status()가 함께 돌려준다
import type { BadgeState, RewardsStatus } from "./api";

export const BADGE_INFO: Record<string, { emoji: string; name: string }> = {
  first_day: { emoji: "🌱", name: "첫 걸음" },
  first_stamp: { emoji: "🎯", name: "첫 도장" },
  streak_3: { emoji: "🔥", name: "3일 연속" },
  streak_7: { emoji: "⚡", name: "일주일 연속" },
  streak_14: { emoji: "🌈", name: "2주 연속" },
  streak_30: { emoji: "🏅", name: "한 달 연속" },
  streak_100: { emoji: "👑", name: "100일 연속" },
  stamps_10: { emoji: "📒", name: "도장 10개" },
  stamps_30: { emoji: "📗", name: "도장 30개" },
  stamps_100: { emoji: "📚", name: "도장 100개" },
  words_10: { emoji: "🐣", name: "단어 10개" },
  words_50: { emoji: "🐥", name: "단어 50개" },
  words_100: { emoji: "🦉", name: "단어 100개" },
  words_300: { emoji: "🚀", name: "단어 300개" },
  words_500: { emoji: "🌟", name: "단어 500개" },
  words_1000: { emoji: "🏆", name: "단어 1000개" },
  perfect_10: { emoji: "💎", name: "만점 10번" },
  perfect_50: { emoji: "👏", name: "만점 50번" },
  placement: { emoji: "🧭", name: "레벨 테스트" },
  sentence_50: { emoji: "💬", name: "문장 50개" },
  alphabet_26: { emoji: "🔤", name: "알파벳 26자" },
};

export function badgeInfo(key: string) {
  return BADGE_INFO[key] ?? { emoji: "🎖️", name: key };
}

// 받는 방법 (아이가 읽는 말)
export function badgeHow(b: Pick<BadgeState, "metric" | "threshold">): string {
  const n = b.threshold;
  switch (b.metric) {
    case "studied_days":
      return "처음으로 공부하면 받아요";
    case "met_days":
      return n === 1 ? "오늘의 목표를 처음 다 채우면 받아요" : `도장을 ${n}개 모으면 받아요`;
    case "best_streak":
      return `${n}일 연속으로 목표를 채우면 받아요`;
    case "mastered_words":
      return `단어 ${n}개를 외우면 받아요`;
    case "trophies":
      return `만점을 ${n}번 받으면 받아요`;
    case "placement":
      return "레벨 테스트를 보면 받아요";
    case "sentence_correct":
      return `문장 문제를 ${n}개 맞히면 받아요`;
    case "alphabet_mastered":
      return `알파벳 ${n}자를 모두 익히면 받아요`;
    default:
      return "";
  }
}

export function badgeProgress(status: RewardsStatus, b: BadgeState): number {
  return Math.min(status.metrics[b.metric] ?? 0, b.threshold);
}

export function earnedBadges(status: RewardsStatus): BadgeState[] {
  return status.badges.filter((b) => b.earned_at);
}

// 아직 안 본 새 배지 (아이 축하 화면용)
export function newBadges(status: RewardsStatus): BadgeState[] {
  return status.badges.filter((b) => b.earned_at && !b.seen);
}

// 다음에 받을 배지: 아직 못 받은 것 중 가장 가까운 것 (레벨 테스트·첫 걸음처럼 한 번에 받는 건 빼고)
export function nextBadge(status: RewardsStatus): BadgeState | null {
  const candidates = status.badges.filter((b) => !b.earned_at && b.threshold > 1);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, b) =>
    badgeProgress(status, b) / b.threshold > badgeProgress(status, best) / best.threshold ? b : best
  );
}
