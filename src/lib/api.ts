import { supabase } from "./supabase";
import { Word, WordSet, LearningRecord, Reward, ModuleType, Profile, ParentChild } from "./types";

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

export async function getChildren(parentId: string): Promise<ParentChild[]> {
  const { data, error } = await supabase
    .from("parent_child")
    .select("*, child:profiles!parent_child_child_id_fkey(*)")
    .eq("parent_id", parentId);
  if (error) return [];
  return data || [];
}

export async function linkChild(parentId: string, childEmail: string): Promise<{ error: string | null }> {
  const { data: childProfile, error: findError } = await supabase
    .from("profiles")
    .select("*")
    .eq("email", childEmail)
    .eq("role", "student")
    .single();

  if (findError || !childProfile) return { error: "해당 이메일의 학생 계정을 찾을 수 없습니다." };

  const { error } = await supabase
    .from("parent_child")
    .insert({ parent_id: parentId, child_id: childProfile.id });

  if (error) {
    if (error.code === "23505") return { error: "이미 등록된 자녀입니다." };
    return { error: error.message };
  }
  return { error: null };
}

export async function unlinkChild(parentId: string, childId: string): Promise<boolean> {
  const { error } = await supabase
    .from("parent_child")
    .delete()
    .eq("parent_id", parentId)
    .eq("child_id", childId);
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

  // 복습 스케줄 생성
  const { data: insertedWords } = await supabase
    .from("words")
    .select("id")
    .eq("word_set_id", wordSet.id);

  if (insertedWords) {
    const schedules = insertedWords.map((w) => ({
      word_id: w.id,
      word_set_id: wordSet.id,
      student_id: childId,
      next_review_date: getNextReviewDate(0),
      review_count: 0,
      ease_factor: 2.5,
    }));
    await supabase.from("review_schedules").insert(schedules);
  }

  return wordSet;
}

export async function getWordSets(userId?: string, role?: string): Promise<WordSet[]> {
  let query = supabase
    .from("word_sets")
    .select("*, words(*)")
    .order("date", { ascending: false });

  if (userId && role === "parent") {
    query = query.eq("parent_id", userId);
  } else if (userId && role === "student") {
    query = query.eq("child_id", userId);
  }

  const { data, error } = await query;
  if (error) return [];
  return data || [];
}

export async function getWordSetsByChild(childId: string): Promise<WordSet[]> {
  const { data, error } = await supabase
    .from("word_sets")
    .select("*, words(*)")
    .eq("child_id", childId)
    .order("date", { ascending: false });

  if (error) return [];
  return data || [];
}

export async function getWordSetByDate(date: string): Promise<WordSet | null> {
  const { data, error } = await supabase
    .from("word_sets")
    .select("*, words(*)")
    .eq("date", date)
    .single();

  if (error) return null;
  return data;
}

export async function getTodayWordSet(): Promise<WordSet | null> {
  const today = new Date().toISOString().split("T")[0];
  return getWordSetByDate(today);
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
  const { data, error } = await supabase
    .from("learning_records")
    .select("word_id, is_correct, module_type, words!inner(word_set_id, english, korean)")
    .eq("words.word_set_id", wordSetId);

  if (error || !data) return [];

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

// ============ Review System (에빙하우스) ============

function getNextReviewDate(reviewCount: number): string {
  const intervals = [1, 3, 7, 14, 30, 60]; // 일 단위
  const days = intervals[Math.min(reviewCount, intervals.length - 1)];
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

export async function getWordsForReview(studentId?: string): Promise<Word[]> {
  const today = new Date().toISOString().split("T")[0];

  let query = supabase
    .from("review_schedules")
    .select("*, words(*)")
    .lte("next_review_date", today);

  if (studentId) query = query.eq("student_id", studentId);

  const { data, error } = await query;
  if (error || !data) return [];
  return data.map((s: any) => s.words).filter(Boolean);
}

export async function updateReviewSchedule(wordId: string): Promise<void> {
  const { data } = await supabase
    .from("review_schedules")
    .select("*")
    .eq("word_id", wordId)
    .single();

  if (!data) return;

  const newCount = data.review_count + 1;
  await supabase
    .from("review_schedules")
    .update({
      review_count: newCount,
      next_review_date: getNextReviewDate(newCount),
    })
    .eq("word_id", wordId);
}

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
  const today = new Date().toISOString().split("T")[0];
  const todayStart = `${today}T00:00:00.000Z`;
  const todayEnd = `${today}T23:59:59.999Z`;

  const [{ data: records }, { data: rewards }] = await Promise.all([
    supabase
      .from("learning_records")
      .select("word_id, module_type, is_correct, created_at")
      .eq("student_id", studentId)
      .gte("created_at", todayStart)
      .lte("created_at", todayEnd)
      .order("created_at", { ascending: true }),
    supabase
      .from("rewards")
      .select("id", { count: "exact" })
      .eq("student_id", studentId)
      .gte("earned_at", todayStart)
      .lte("earned_at", todayEnd),
  ]);

  if (!records || records.length === 0) {
    return { totalScore: 0, moduleStats: {}, totalSessions: 0, rewardCount: rewards?.length || 0 };
  }

  // 세션 구분 로직:
  // - 배치 모듈 (flashcard/quiz/matching/speed): 같은 트랜잭션은 같은 타임스탬프(NOW())이므로
  //   같은 모듈 내에서 타임스탬프가 달라지면 새 세션
  // - 비배치 모듈 (spelling/scramble/listening): 30초 이상 간격이면 새 세션
  const BATCH_MODULES = new Set(["flashcard", "quiz", "matching", "speed"]);
  const NON_BATCH_GAP_MS = 30 * 1000;
  const moduleGroups: Record<string, { correct: number; total: number }[]> = {};
  const moduleLastTime: Record<string, number> = {};

  for (const r of records) {
    const mod = r.module_type as string;
    const time = new Date(r.created_at).getTime();

    if (!moduleGroups[mod]) {
      moduleGroups[mod] = [{ correct: 0, total: 0 }];
    } else {
      const lastTime = moduleLastTime[mod];
      const isBatch = BATCH_MODULES.has(mod);
      const shouldStartNewSession = isBatch
        ? time !== lastTime
        : time - lastTime > NON_BATCH_GAP_MS;
      if (shouldStartNewSession) {
        moduleGroups[mod].push({ correct: 0, total: 0 });
      }
    }

    const cur = moduleGroups[mod][moduleGroups[mod].length - 1];
    cur.total++;
    if (r.is_correct) cur.correct++;
    moduleLastTime[mod] = time;
  }

  const moduleStats: Record<string, ModuleSessionStat> = {};
  let weightedScoreSum = 0;
  let totalSessions = 0;

  for (const [mod, sessions] of Object.entries(moduleGroups)) {
    const scores = sessions.map((s) => (s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0));
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
    rewardCount: rewards?.length || 0,
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
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days + 1);
  start.setHours(0, 0, 0, 0);
  const startISO = start.toISOString();
  const endISO = new Date(end.getTime() + 86400000).toISOString();

  const [{ data: records }, { data: rewards }] = await Promise.all([
    supabase
      .from("learning_records")
      .select("module_type, is_correct, created_at")
      .eq("student_id", studentId)
      .gte("created_at", startISO)
      .lte("created_at", endISO)
      .order("created_at", { ascending: true }),
    supabase
      .from("rewards")
      .select("id, earned_at")
      .eq("student_id", studentId)
      .gte("earned_at", startISO)
      .lte("earned_at", endISO),
  ]);

  const BATCH_MODULES = new Set(["flashcard", "quiz", "matching", "speed", "exam"]);
  const NON_BATCH_GAP_MS = 30 * 1000;

  // 각 날짜 초기화
  const byDate: Record<string, {
    date: string;
    totalRecords: number;
    correctRecords: number;
    moduleGroups: Record<string, { correct: number; total: number }[]>;
    moduleLastTime: Record<string, number>;
    rewardCount: number;
  }> = {};

  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    byDate[dateStr] = {
      date: dateStr,
      totalRecords: 0,
      correctRecords: 0,
      moduleGroups: {},
      moduleLastTime: {},
      rewardCount: 0,
    };
  }

  // 레코드 집계 (배치/비배치 모듈 세션 구분)
  for (const r of records || []) {
    const dateStr = (r.created_at as string).split("T")[0];
    if (!byDate[dateStr]) continue;
    const day = byDate[dateStr];
    const mod = r.module_type as string;
    const time = new Date(r.created_at as string).getTime();

    day.totalRecords++;
    if (r.is_correct) day.correctRecords++;

    if (!day.moduleGroups[mod]) {
      day.moduleGroups[mod] = [{ correct: 0, total: 0 }];
    } else {
      const lastTime = day.moduleLastTime[mod];
      const isBatch = BATCH_MODULES.has(mod);
      const newSession = isBatch ? time !== lastTime : time - lastTime > NON_BATCH_GAP_MS;
      if (newSession) day.moduleGroups[mod].push({ correct: 0, total: 0 });
    }
    const cur = day.moduleGroups[mod][day.moduleGroups[mod].length - 1];
    cur.total++;
    if (r.is_correct) cur.correct++;
    day.moduleLastTime[mod] = time;
  }

  // 보상 집계
  for (const reward of rewards || []) {
    const dateStr = (reward.earned_at as string).split("T")[0];
    if (byDate[dateStr]) byDate[dateStr].rewardCount++;
  }

  // 최종 변환
  return Object.values(byDate)
    .map((day) => {
      const moduleStats: Record<string, DailyModuleStat> = {};
      let examBestScore: number | null = null;

      for (const [mod, sessions] of Object.entries(day.moduleGroups)) {
        const totalCorrect = sessions.reduce((s, x) => s + x.correct, 0);
        const totalAttempts = sessions.reduce((s, x) => s + x.total, 0);
        const sessionScores = sessions.map((s) => (s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0));
        const bestScore = sessionScores.length > 0 ? Math.max(...sessionScores) : 0;
        moduleStats[mod] = {
          sessions: sessions.length,
          accuracy: totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0,
          bestScore,
        };
        if (mod === "exam") examBestScore = bestScore;
      }

      return {
        date: day.date,
        totalRecords: day.totalRecords,
        correctRecords: day.correctRecords,
        accuracy: day.totalRecords > 0 ? Math.round((day.correctRecords / day.totalRecords) * 100) : 0,
        moduleStats,
        examBestScore,
        rewardCount: day.rewardCount,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ============ Dashboard Stats ============

export async function getDashboardStats(parentId?: string, childId?: string) {
  let setsQuery = supabase.from("word_sets").select("id, date").order("date", { ascending: false });
  if (parentId) setsQuery = setsQuery.eq("parent_id", parentId);
  if (childId) setsQuery = setsQuery.eq("child_id", childId);
  const { data: wordSets } = await setsQuery;

  let recordsQuery = supabase.from("learning_records").select("is_correct, created_at, module_type");
  if (childId) recordsQuery = recordsQuery.eq("student_id", childId);
  const { data: records } = await recordsQuery;

  let rewardsQuery = supabase.from("rewards").select("*", { count: "exact", head: true });
  if (childId) rewardsQuery = rewardsQuery.eq("student_id", childId);
  const { count: rewardCount } = await rewardsQuery;

  const totalSets = wordSets?.length || 0;
  const totalRecords = records?.length || 0;
  const correctRecords = records?.filter((r) => r.is_correct).length || 0;
  const accuracy = totalRecords > 0 ? Math.round((correctRecords / totalRecords) * 100) : 0;

  // 모듈별 통계
  const moduleStats: Record<string, { total: number; correct: number }> = {};
  records?.forEach((r) => {
    if (!moduleStats[r.module_type]) {
      moduleStats[r.module_type] = { total: 0, correct: 0 };
    }
    moduleStats[r.module_type].total++;
    if (r.is_correct) moduleStats[r.module_type].correct++;
  });

  return {
    totalSets,
    totalRecords,
    correctRecords,
    accuracy,
    rewardCount: rewardCount || 0,
    moduleStats,
  };
}
