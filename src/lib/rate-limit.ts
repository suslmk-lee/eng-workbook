// 서버리스 인스턴스 메모리 기반의 간단한 호출 횟수 제한 (슬라이딩 윈도).
// 인스턴스마다 따로 세므로 완벽하진 않지만, 한 사용자의 연속 호출은 막는다.
// 공개 서비스 규모에서는 Redis 등 공유 저장소 기반으로 교체할 것.

const hits = new Map<string, number[]>();
const MAX_KEYS = 5000;

// 허용되면 true를 반환하고 이번 호출을 기록한다.
export function allowRequest(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);

  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }

  recent.push(now);
  hits.set(key, recent);

  if (hits.size > MAX_KEYS) {
    hits.forEach((times, k) => {
      if (!times.some((t) => now - t < windowMs)) hits.delete(k);
    });
  }
  return true;
}
