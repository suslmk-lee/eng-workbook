import { supabase } from "./supabase";
import { Word, WordSet, LearningRecord, Reward, ModuleType, Profile, Child, DictionaryWord } from "./types";
import { localMidnight, toLocalDateString } from "./utils";

// ============ 전체 행 조회 (페이지 나눠 읽기) ============
// Supabase(PostgREST)는 한 번에 최대 1000행(프로젝트 기본 max rows)만 돌려준다.
// 통계처럼 전체가 필요한 조회는 1000행씩 끝까지 읽는다.
// 페이지 경계에서 행이 빠지거나 겹치지 않도록, 쿼리 정렬의 마지막은 항상 고유 컬럼(id)으로 할 것.
const PAGE_SIZE = 1000;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error("fetchAllRows:", error.message);
      break;
    }
    if (!data) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

// ============ 학습 세션 구분 (오늘 점수·날짜별 통계 공통) ============
// - 배치 모듈: 끝날 때 한 번에 저장 → 같은 세션 기록은 created_at(NOW())이 같음. 시각이 바뀌면 새 세션
// - 비배치 모듈: 문제마다 저장 → 30초 넘게 비면 새 세션
const BATCH_MODULES = new Set<string>(["flashcard", "quiz", "matching", "speed", "exam"]);
const NON_BATCH_GAP_MS = 30 * 1000;

type StatRecord = { module_type: string; is_correct: boolean; created_at: string };
type SessionTally = { correct: number; total: number };

// created_at 오름차순 기록 → 모듈별 세션 목록
function groupSessionsByModule(records: StatRecord[]): Record<string, SessionTally[]> {
  const groups: Record<string, SessionTally[]> = {};
  const lastTime: Record<string, number> = {};

  for (const r of records) {
    const mod = r.module_type;
    const time = new Date(r.created_at).getTime();

    if (!groups[mod]) {
      groups[mod] = [{ correct: 0, total: 0 }];
    } else {
      const newSession = BATCH_MODULES.has(mod)
        ? time !== lastTime[mod]
        : time - lastTime[mod] > NON_BATCH_GAP_MS;
      if (newSession) groups[mod].push({ correct: 0, total: 0 });
    }

    const cur = groups[mod][groups[mod].length - 1];
    cur.total++;
    if (r.is_correct) cur.correct++;
    lastTime[mod] = time;
  }
  return groups;
}

function sessionScore(s: SessionTally): number {
  return s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
}

// ============ Profiles & Auth ============

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) return null;
  return data;
}

// ============ 자녀 프로필 (내 가족) ============
// RLS가 "내 가족"으로 범위를 제한하므로 별도 필터가 필요 없다.

export async function getChildren(): Promise<Child[]> {
  const { data, error } = await supabase
    .from("children")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) return [];
  return data || [];
}

// 없으면 null, 네트워크 등 조회 실패는 예외 (삭제된 것으로 오해하지 않도록)
export async function getChild(childId: string): Promise<Child | null> {
  const { data, error } = await supabase.from("children").select("*").eq("id", childId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createChild(
  name: string,
  grade: number
): Promise<{ child: Child | null; error: string | null }> {
  // family_id는 DB 기본값(내 가족)으로 채워진다
  const { data, error } = await supabase
    .from("children")
    .insert({ name: name.trim(), grade })
    .select()
    .single();
  if (error) return { child: null, error: error.message };
  return { child: data, error: null };
}

// 오늘의 학습 설정 (학년·하루 새 단어 수·자동 구성·레벨 테스트 결과 초기화)
export async function updateChildSettings(
  childId: string,
  settings: Partial<
    Pick<Child, "grade" | "daily_new_words" | "auto_lesson" | "start_level" | "placement_done_at">
  >
): Promise<boolean> {
  const { error } = await supabase.from("children").update(settings).eq("id", childId);
  return !error;
}

export async function renameChild(childId: string, name: string): Promise<boolean> {
  const { error } = await supabase.from("children").update({ name: name.trim() }).eq("id", childId);
  return !error;
}

// 자녀를 지우면 그 아이의 단어 세트·학습 기록·보상도 함께 삭제된다 (FK CASCADE)
export async function deleteChild(childId: string): Promise<boolean> {
  const { error } = await supabase.from("children").delete().eq("id", childId);
  return !error;
}

// ============ 부모 PIN (자녀 모드 잠금) ============

export async function hasParentPin(): Promise<boolean> {
  const { data, error } = await supabase.rpc("has_parent_pin");
  return !error && data === true;
}

export async function verifyParentPin(pin: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("verify_parent_pin", { pin });
  return !error && data === true;
}

// 이미 PIN이 있으면 currentPin이 필요. PIN 분실 시에는 비밀번호로 다시 로그인한 직후(10분 내)
// currentPin 없이 바꿀 수 있다.
export async function setParentPin(
  newPin: string,
  currentPin?: string
): Promise<{ error: "current_pin_required" | "failed" | null }> {
  const { error } = await supabase.rpc("set_parent_pin", {
    new_pin: newPin,
    current_pin: currentPin ?? null,
  });
  if (!error) return { error: null };
  return { error: /current PIN required/i.test(error.message) ? "current_pin_required" : "failed" };
}

// ============ 약관 동의·계정 ============

// 내가 동의한 약관 버전. 동의 기록이 없으면 null, 조회 실패면 undefined
export async function getMyTermsVersion(userId: string): Promise<string | null | undefined> {
  const { data, error } = await supabase.from("profiles").select("terms_version").eq("id", userId).maybeSingle();
  if (error || !data) return undefined;
  return data.terms_version ?? null;
}

// 지금 약관에 동의. withChildren이면 동의 기록이 없는 기존 자녀도 법정대리인 동의로 기록
export async function agreeTerms(version: string, withChildren: boolean): Promise<boolean> {
  const { error } = await supabase.rpc("agree_terms", { version, with_children: withChildren });
  return !error;
}

// 우리 가족을 관리하는 보호자 계정 수 (나 포함). 조회 실패면 null
export async function getGuardianCount(): Promise<number | null> {
  const { count, error } = await supabase.from("family_members").select("user_id", { count: "exact", head: true });
  return error ? null : count ?? 0;
}

// 회원 탈퇴. 가족에 다른 보호자가 없으면 자녀·학습 기록까지 모두 삭제된다 (되돌릴 수 없음)
export async function deleteMyAccount(): Promise<boolean> {
  const { error } = await supabase.rpc("delete_my_account");
  return !error;
}

// 비밀번호 재설정 메일. 가입하지 않은 이메일이어도 같은 결과를 보여준다 (가입 여부 노출 방지)
export async function requestPasswordReset(email: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (!error) return { error: null };
  if (error.status === 429 || /rate limit|security purposes/i.test(error.message)) {
    return { error: "잠시 후에 다시 시도해주세요. 메일은 짧은 시간에 여러 번 보낼 수 없어요." };
  }
  return { error: "메일을 보내지 못했어요. 잠시 후 다시 시도해주세요." };
}

export async function changePassword(password: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.updateUser({ password });
  if (!error) return { error: null };
  if (/different from the old/i.test(error.message)) return { error: "지금 쓰는 비밀번호와 다른 비밀번호를 입력해주세요." };
  if (/at least|weak|short/i.test(error.message)) return { error: "비밀번호는 6자 이상이어야 해요." };
  if (/session|jwt|expired/i.test(error.message)) return { error: "로그인이 만료되었어요. 다시 로그인한 뒤 시도해주세요." };
  return { error: "비밀번호를 바꾸지 못했어요. 다시 시도해주세요." };
}

// 탈퇴처럼 되돌릴 수 없는 작업 전에 비밀번호를 다시 확인
export async function verifyPassword(email: string, password: string): Promise<boolean> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return !error;
}

// ============ Word Sets ============

export async function createWordSet(
  title: string,
  date: string,
  words: { english: string; korean: string }[],
  parentId: string,
  childId: string
): Promise<WordSet | null> {
  const { data: wordSet, error: setError } = await supabase
    .from("word_sets")
    .insert({ title, date, parent_id: parentId, child_id: childId })
    .select()
    .single();

  if (setError || !wordSet) return null;

  const wordRows = words.map((w) => ({
    word_set_id: wordSet.id,
    english: w.english.trim().toLowerCase(),
    korean: w.korean.trim(),
  }));

  const { error: wordsError } = await supabase.from("words").insert(wordRows);
  if (wordsError) {
    await supabase.from("word_sets").delete().eq("id", wordSet.id);
    return null;
  }
  // 복습 일정은 아이가 학습할 때 DB가 단어별로 자동 관리한다 (child_word_progress)
  return wordSet;
}

// 단어 + 사전 예문
const WORD_SET_SELECT = "*, words(*, dictionary_words(example_en, example_ko))";

export async function getWordSetsByChild(childId: string, limit = 60): Promise<WordSet[]> {
  const { data, error } = await supabase
    .from("word_sets")
    .select(WORD_SET_SELECT)
    .eq("child_id", childId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return data || [];
}

// 학습 모듈용: setId가 있으면 그 세트, 없으면 가장 최근 세트
export async function getWordSetForChild(childId: string, setId?: string | null): Promise<WordSet | null> {
  let query = supabase.from("word_sets").select(WORD_SET_SELECT).eq("child_id", childId);
  query = setId
    ? query.eq("id", setId)
    : query.order("date", { ascending: false }).order("created_at", { ascending: false }).limit(1);
  const { data, error } = await query.maybeSingle();
  if (error) return null;
  return data;
}

// ============ 오늘의 학습 ============

// 오늘의 학습 세트를 만들고(이미 있으면 그대로) id를 돌려준다. 만들 게 없으면 null
export async function ensureTodayLesson(childId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("ensure_daily_lesson", {
    p_child: childId,
    p_day: toLocalDateString(),
  });
  if (error) {
    console.error("ensureTodayLesson:", error.message);
    return null;
  }
  return data ?? null;
}

// ============ 공용 사전·레벨 테스트·주제별 단어장 ============

let dictionaryCache: Promise<DictionaryWord[]> | null = null;

// 사전 전체(500단어 남짓). 한 번 불러오면 페이지를 떠날 때까지 재사용
export function getDictionary(): Promise<DictionaryWord[]> {
  if (!dictionaryCache) {
    dictionaryCache = fetchAllRows<DictionaryWord>((from, to) =>
      supabase
        .from("dictionary_words")
        .select("id, english, korean, level, theme, sort_order")
        .order("level", { ascending: true })
        .order("sort_order", { ascending: true })
        .range(from, to)
    ).then((rows) => {
      if (rows.length === 0) dictionaryCache = null; // 실패 시 다음에 다시 시도
      return rows;
    });
  }
  return dictionaryCache;
}

// 아이가 학습한 단어 → 연속 정답 횟수(streak)
export async function getLearnedWords(childId: string): Promise<Map<string, number>> {
  const rows = await fetchAllRows<{ english: string; streak: number }>((from, to) =>
    supabase
      .from("child_word_progress")
      .select("english, streak")
      .eq("child_id", childId)
      .order("english", { ascending: true })
      .range(from, to)
  );
  return new Map(rows.map((r) => [r.english, r.streak]));
}

export interface PlacementResult {
  start_level: number;
  known_words: number;
  levels: { level: number; total: number; correct: number }[];
}

export async function submitPlacement(
  childId: string,
  results: { english: string; correct: boolean }[]
): Promise<PlacementResult | null> {
  const { data, error } = await supabase.rpc("apply_placement_result", {
    p_child: childId,
    p_results: results,
    p_day: toLocalDateString(),
  });
  if (error) {
    console.error("submitPlacement:", error.message);
    return null;
  }
  return data as PlacementResult;
}

// 주제별 단어장 세트를 만들고(오늘 이미 있으면 그대로) id를 돌려준다
export async function createThemeLesson(childId: string, theme: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("create_theme_lesson", {
    p_child: childId,
    p_theme: theme,
    p_day: toLocalDateString(),
  });
  if (error) {
    console.error("createThemeLesson:", error.message);
    return null;
  }
  return data ?? null;
}

export interface WordProgressSummary {
  studied: number;   // 한 번이라도 학습한 단어
  mastered: number;  // 서로 다른 날 3번 이상 연속으로 맞힌 단어
  dueToday: number;  // 오늘까지 복습할 단어
  weakWords: { english: string; korean: string | null; wrong_count: number; correct_count: number }[];
}

export async function getWordProgressSummary(childId: string): Promise<WordProgressSummary> {
  const today = toLocalDateString();
  const head = { count: "exact" as const, head: true };
  const [studied, mastered, due, weak] = await Promise.all([
    supabase.from("child_word_progress").select("english", head).eq("child_id", childId),
    supabase.from("child_word_progress").select("english", head).eq("child_id", childId).gte("streak", 3),
    supabase.from("child_word_progress").select("english", head).eq("child_id", childId).lte("next_review_date", today),
    supabase
      .from("child_word_progress")
      .select("english, korean, wrong_count, correct_count")
      .eq("child_id", childId)
      .gt("wrong_count", 0)
      .order("wrong_count", { ascending: false })
      .order("english", { ascending: true })
      .limit(5),
  ]);
  return {
    studied: studied.count ?? 0,
    mastered: mastered.count ?? 0,
    dueToday: due.count ?? 0,
    weakWords: weak.data ?? [],
  };
}

export async function getLatestWordSet(childId?: string): Promise<WordSet | null> {
  let query = supabase
    .from("word_sets")
    .select("*, words(*)")
    .order("date", { ascending: false })
    .limit(1);

  if (childId) {
    query = query.eq("child_id", childId);
  }

  const { data, error } = await query.single();
  if (error) return null;
  return data;
}

export async function deleteWordSet(id: string): Promise<boolean> {
  const { error } = await supabase.from("word_sets").delete().eq("id", id);
  return !error;
}

// ============ Learning Records ============

export async function saveLearningRecord(
  wordId: string,
  moduleType: ModuleType,
  isCorrect: boolean,
  responseTimeMs?: number,
  studentId?: string
): Promise<void> {
  await supabase.from("learning_records").insert({
    word_id: wordId,
    module_type: moduleType,
    is_correct: isCorrect,
    response_time_ms: responseTimeMs,
    student_id: studentId,
  });
}

export async function saveBatchLearningRecords(
  records: {
    wordId: string;
    moduleType: ModuleType;
    isCorrect: boolean;
    responseTimeMs?: number;
  }[],
  studentId?: string
): Promise<void> {
  const rows = records.map((r) => ({
    word_id: r.wordId,
    module_type: r.moduleType,
    is_correct: r.isCorrect,
    response_time_ms: r.responseTimeMs,
    student_id: studentId,
  }));
  await supabase.from("learning_records").insert(rows);
}

export async function getLearningRecords(
  wordSetId?: string,
  moduleType?: ModuleType
): Promise<LearningRecord[]> {
  let query = supabase
    .from("learning_records")
    .select("*, words!inner(word_set_id)")
    .order("created_at", { ascending: false });

  if (wordSetId) {
    query = query.eq("words.word_set_id", wordSetId);
  }
  if (moduleType) {
    query = query.eq("module_type", moduleType);
  }

  const { data, error } = await query;
  if (error) return [];
  return data || [];
}

export async function getWordStats(wordSetId: string) {
  const data = await fetchAllRows<any>((from, to) =>
    supabase
      .from("learning_records")
      .select("word_id, is_correct, module_type, words!inner(word_set_id, english, korean)")
      .eq("words.word_set_id", wordSetId)
      .order("id", { ascending: true })
      .range(from, to)
  );

  const statsMap = new Map<
    string,
    { word_id: string; english: string; korean: string; correct: number; incorrect: number }
  >();

  data.forEach((record: any) => {
    const key = record.word_id;
    if (!statsMap.has(key)) {
      statsMap.set(key, {
        word_id: key,
        english: record.words.english,
        korean: record.words.korean,
        correct: 0,
        incorrect: 0,
      });
    }
    const stat = statsMap.get(key)!;
    if (record.is_correct) stat.correct++;
    else stat.incorrect++;
  });

  return Array.from(statsMap.values());
}

// 망각곡선 복습은 DB가 단어별로 관리한다 (child_word_progress, 학습 기록 저장 시 자동 갱신).
// 복습할 단어는 오늘의 학습(ensureTodayLesson)에 자동으로 들어간다.

// ============ Rewards ============

export async function addReward(
  type: Reward["type"],
  description: string,
  moduleType?: ModuleType,
  studentId?: string
): Promise<void> {
  await supabase.from("rewards").insert({ type, description, module_type: moduleType, student_id: studentId });
}

export async function getRewards(studentId?: string): Promise<Reward[]> {
  let query = supabase
    .from("rewards")
    .select("*")
    .order("earned_at", { ascending: false });

  if (studentId) query = query.eq("student_id", studentId);

  const { data, error } = await query;
  if (error) return [];
  return data || [];
}

export async function getRewardCount(studentId?: string): Promise<number> {
  let query = supabase
    .from("rewards")
    .select("*", { count: "exact", head: true });

  if (studentId) query = query.eq("student_id", studentId);

  const { count, error } = await query;
  if (error) return 0;
  return count || 0;
}

// ============ Today's Learning Stats ============

export interface ModuleSessionStat {
  sessionCount: number;       // 오늘 해당 모듈 진행 횟수
  bestScore: number;          // 최고 정답률 (0~100)
  lastScore: number;          // 마지막 정답률
  hasPerfect: boolean;        // 오늘 만점 있는지
}

export interface TodayStats {
  totalScore: number;         // 오늘 종합 점수 (100점 만점)
  moduleStats: Record<string, ModuleSessionStat>;
  totalSessions: number;      // 오늘 모듈 완료 횟수 합산
  rewardCount: number;        // 오늘 획득 보상 수
}

export async function getTodayStats(studentId: string): Promise<TodayStats> {
  // 오늘 = 기기 현지 시간 0시 ~ 내일 0시
  const todayStart = localMidnight(0).toISOString();
  const tomorrowStart = localMidnight(1).toISOString();

  const [records, { count: rewardCount }] = await Promise.all([
    fetchAllRows<StatRecord>((from, to) =>
      supabase
        .from("learning_records")
        .select("module_type, is_correct, created_at")
        .eq("student_id", studentId)
        .gte("created_at", todayStart)
        .lt("created_at", tomorrowStart)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
    ),
    supabase
      .from("rewards")
      .select("id", { count: "exact", head: true })
      .eq("student_id", studentId)
      .gte("earned_at", todayStart)
      .lt("earned_at", tomorrowStart),
  ]);

  if (records.length === 0) {
    return { totalScore: 0, moduleStats: {}, totalSessions: 0, rewardCount: rewardCount || 0 };
  }

  const moduleGroups = groupSessionsByModule(records);
  const moduleStats: Record<string, ModuleSessionStat> = {};
  let weightedScoreSum = 0;
  let totalSessions = 0;

  for (const [mod, sessions] of Object.entries(moduleGroups)) {
    const scores = sessions.map(sessionScore);
    const best = Math.max(...scores);
    const last = scores[scores.length - 1];
    moduleStats[mod] = {
      sessionCount: sessions.length,
      bestScore: best,
      lastScore: last,
      hasPerfect: best === 100,
    };
    weightedScoreSum += best;
    totalSessions += sessions.length;
  }

  // 종합 점수: 모든 모듈 최고점수 평균 (참여한 모듈이 많을수록 보너스)
  const moduleCount = Object.keys(moduleGroups).length;
  const baseScore = moduleCount > 0 ? Math.round(weightedScoreSum / moduleCount) : 0;
  const participationBonus = Math.min(moduleCount * 3, 21); // 최대 +21점 (7모듈)
  const totalScore = Math.min(baseScore + participationBonus, 100);

  return {
    totalScore,
    moduleStats,
    totalSessions,
    rewardCount: rewardCount || 0,
  };
}

// ============ Daily Stats (날짜별 통계) ============

export interface DailyModuleStat {
  sessions: number;
  accuracy: number;   // 누적 정답률
  bestScore: number;  // 최고 세션 정답률
}

export interface DailyStats {
  date: string;       // YYYY-MM-DD
  totalRecords: number;
  correctRecords: number;
  accuracy: number;
  moduleStats: Record<string, DailyModuleStat>;
  examBestScore: number | null;
  rewardCount: number;
}

export async function getDailyStatsRange(studentId: string, days: number): Promise<DailyStats[]> {
  // (days-1)일 전 현지 0시 ~ 내일 현지 0시
  const start = localMidnight(-(days - 1));
  const startISO = start.toISOString();
  const endISO = localMidnight(1).toISOString();

  const [records, rewards] = await Promise.all([
    fetchAllRows<StatRecord>((from, to) =>
      supabase
        .from("learning_records")
        .select("module_type, is_correct, created_at")
        .eq("student_id", studentId)
        .gte("created_at", startISO)
        .lt("created_at", endISO)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<{ earned_at: string }>((from, to) =>
      supabase
        .from("rewards")
        .select("id, earned_at")
        .eq("student_id", studentId)
        .gte("earned_at", startISO)
        .lt("earned_at", endISO)
        .order("id", { ascending: true })
        .range(from, to)
    ),
  ]);

  // 현지 날짜별로 나누기 (오래된 날 → 오늘)
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    dates.push(toLocalDateString(d));
  }
  const recordsByDate = new Map<string, StatRecord[]>(dates.map((d) => [d, []]));
  for (const r of records) {
    recordsByDate.get(toLocalDateString(new Date(r.created_at)))?.push(r);
  }
  const rewardsByDate = new Map<string, number>();
  for (const reward of rewards) {
    const date = toLocalDateString(new Date(reward.earned_at));
    rewardsByDate.set(date, (rewardsByDate.get(date) ?? 0) + 1);
  }

  return dates.map((date) => {
    const dayRecords = recordsByDate.get(date) ?? [];
    const correctRecords = dayRecords.filter((r) => r.is_correct).length;
    const moduleStats: Record<string, DailyModuleStat> = {};
    let examBestScore: number | null = null;

    for (const [mod, sessions] of Object.entries(groupSessionsByModule(dayRecords))) {
      const totalCorrect = sessions.reduce((s, x) => s + x.correct, 0);
      const totalAttempts = sessions.reduce((s, x) => s + x.total, 0);
      const bestScore = Math.max(...sessions.map(sessionScore));
      moduleStats[mod] = {
        sessions: sessions.length,
        accuracy: totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0,
        bestScore,
      };
      if (mod === "exam") examBestScore = bestScore;
    }

    return {
      date,
      totalRecords: dayRecords.length,
      correctRecords,
      accuracy: dayRecords.length > 0 ? Math.round((correctRecords / dayRecords.length) * 100) : 0,
      moduleStats,
      examBestScore,
      rewardCount: rewardsByDate.get(date) ?? 0,
    };
  });
}

// ============ Dashboard Stats ============

// 한 자녀 기준 (가족의 어느 학부모가 등록한 단어 세트든 모두 포함)
export async function getDashboardStats(childId: string) {
  const [{ count: totalSets }, records, { count: rewardCount }] = await Promise.all([
    supabase.from("word_sets").select("id", { count: "exact", head: true }).eq("child_id", childId),
    fetchAllRows<{ is_correct: boolean; module_type: string }>((from, to) =>
      supabase
        .from("learning_records")
        .select("is_correct, module_type")
        .eq("student_id", childId)
        .order("id", { ascending: true })
        .range(from, to)
    ),
    supabase.from("rewards").select("id", { count: "exact", head: true }).eq("student_id", childId),
  ]);

  const totalRecords = records.length;
  const correctRecords = records.filter((r) => r.is_correct).length;
  const accuracy = totalRecords > 0 ? Math.round((correctRecords / totalRecords) * 100) : 0;

  // 모듈별 통계
  const moduleStats: Record<string, { total: number; correct: number }> = {};
  records.forEach((r) => {
    if (!moduleStats[r.module_type]) {
      moduleStats[r.module_type] = { total: 0, correct: 0 };
    }
    moduleStats[r.module_type].total++;
    if (r.is_correct) moduleStats[r.module_type].correct++;
  });

  return {
    totalSets: totalSets || 0,
    totalRecords,
    correctRecords,
    accuracy,
    rewardCount: rewardCount || 0,
    moduleStats,
  };
}
