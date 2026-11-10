"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Star,
  Layers,
  CircleHelp,
  Puzzle,
  PenLine,
  Shuffle,
  Headphones,
  Zap,
  BookOpen,
  RefreshCw,
  Users,
  Trophy,
  Flame,
  RotateCcw,
  Award,
  Lock,
  Mic,
  Swords,
  TextCursorInput,
  ListOrdered,
  Speech,
} from "lucide-react";
import { WordSet, Child, MODULE_LIST, ModuleInfo, ModuleType, THEME_EMOJI } from "@/lib/types";
import {
  ensureTodayLesson,
  getWordSetsByChild,
  getTodayStats,
  TodayStats,
  getChild,
  getDictionary,
  getLearnedWords,
  createThemeLesson,
  getGoalStatus,
  GoalStatus,
} from "@/lib/api";
import { DailyGoalCard, GoalCelebration } from "@/components/DailyGoal";
import { getTodayString, formatDateShort } from "@/lib/utils";
import { useActiveChild } from "@/lib/child-mode";
import TtsModeToggle from "@/components/TtsModeToggle";

const iconMap: Record<string, any> = {
  Layers, CircleHelp, Puzzle, PenLine, Shuffle, Headphones, Zap, Mic, Swords,
  TextCursorInput, ListOrdered, Speech,
};

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 90 ? "from-green-400 to-emerald-500"
    : score >= 70 ? "from-blue-400 to-primary-500"
    : score >= 50 ? "from-yellow-400 to-orange-400"
    : "from-red-400 to-pink-400";
  const emoji = score >= 90 ? "🏆" : score >= 70 ? "⭐" : score >= 50 ? "👍" : "💪";

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-32 h-32">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          <circle cx="60" cy="60" r="50" fill="none" stroke="#e5e7eb" strokeWidth="12" />
          <circle
            cx="60" cy="60" r="50" fill="none"
            stroke="url(#scoreGrad)" strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${(score / 100) * 314} 314`}
            className="transition-all duration-700"
          />
          <defs>
            <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={score >= 90 ? "#34d399" : score >= 70 ? "#60a5fa" : score >= 50 ? "#fbbf24" : "#f87171"} />
              <stop offset="100%" stopColor={score >= 90 ? "#10b981" : score >= 70 ? "#6366f1" : score >= 50 ? "#f97316" : "#ec4899"} />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center rotate-0">
          <span className="text-2xl">{emoji}</span>
          <span className="text-2xl font-extrabold text-gray-800">{score}</span>
          <span className="text-xs text-gray-400">/ 100</span>
        </div>
      </div>
      <p className="text-sm font-semibold text-gray-600 mt-1">오늘의 점수</p>
    </div>
  );
}

// "오늘 할 공부" 선택 카드
function SetChoice({
  selected,
  onClick,
  emoji,
  title,
  detail,
  note,
}: {
  selected: boolean;
  onClick: () => void;
  emoji: string;
  title: string;
  detail: string;
  note?: string;  // 오늘의 학습 자동 조절 이유
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={`flex items-center gap-3 p-4 rounded-2xl text-left transition-all ${
        selected ? "bg-primary-500 text-white shadow-md" : "bg-white text-gray-800 shadow-sm hover:shadow-md"
      }`}
    >
      <span className="text-3xl">{emoji}</span>
      <span className="min-w-0">
        <span className="block font-bold truncate">{title}</span>
        <span className={`block text-sm ${selected ? "text-blue-100" : "text-gray-500"}`}>{detail}</span>
        {note && (
          <span className={`block text-xs mt-0.5 ${selected ? "text-blue-200" : "text-gray-400"}`}>{note}</span>
        )}
      </span>
    </button>
  );
}

// 학습 모듈에 다녀와도 고른 단어 세트가 유지되도록 (탭을 닫으면 초기화)
const selectedSetKey = (childId: string) => `ew_selected_set_v1:${childId}`;

const placementLaterKey = (childId: string) => `ew_placement_later_v1:${childId}`;

// 오늘의 목표 축하 화면은 아이마다 하루 한 번만
const celebratedKey = (childId: string, day: string) => `ew_goal_celebrated_v1:${childId}:${day}`;

function setLabel(set: WordSet): string {
  return set.source === "auto" ? "오늘의 학습" : set.title || "숙제";
}

function setEmoji(set: WordSet): string {
  return set.source === "auto" ? "🌟" : set.source === "theme" ? "📚" : "📝";
}

interface ThemeInfo {
  theme: string;
  level: number;   // 이 주제가 처음 나오는 레벨 (쉬운 주제부터 보여주기)
  total: number;
  learned: number;
}

export default function StudentPage() {
  const child = useActiveChild();
  const [childInfo, setChildInfo] = useState<Child | null>(null);
  const [placementLater, setPlacementLater] = useState(false);
  const [sets, setSets] = useState<WordSet[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [todayLessonId, setTodayLessonId] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [themes, setThemes] = useState<ThemeInfo[] | null>(null);
  const [showThemes, setShowThemes] = useState(false);
  const [themeBusy, setThemeBusy] = useState<string | null>(null);
  const [todayStats, setTodayStats] = useState<TodayStats | null>(null);
  const [goal, setGoal] = useState<GoalStatus | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [slowNetwork, setSlowNetwork] = useState(false);

  useEffect(() => {
    loadData();
  }, [child.id]);

  // 5초 이상 로딩 중이면 느린 연결 메시지 표시
  useEffect(() => {
    if (!loading) { setSlowNetwork(false); return; }
    const tid = setTimeout(() => setSlowNetwork(true), 5000);
    return () => clearTimeout(tid);
  }, [loading]);

  async function loadData() {
    setLoading(true);
    try {
      // 오늘의 학습을 먼저 만들어야 목록에 포함된다
      const lessonId = await ensureTodayLesson(child.id);
      const [list, stats, info, goalStatus] = await Promise.all([
        getWordSetsByChild(child.id, 30),
        getTodayStats(child.id),
        getChild(child.id).catch(() => null),
        getGoalStatus(child.id),
      ]);
      setSets(list);
      setTodayLessonId(lessonId);
      setTodayStats(stats);
      setChildInfo(info);
      setGoal(goalStatus);
      if (goalStatus?.met) {
        try {
          if (!localStorage.getItem(celebratedKey(child.id, goalStatus.today))) setCelebrate(true);
        } catch {}
      }
      try { setPlacementLater(sessionStorage.getItem(placementLaterKey(child.id)) === "1"); } catch {}

      // 기본 선택: 이 탭에서 고른 세트 > 오늘 숙제 > 오늘의 학습 > 가장 최근 세트
      let saved: string | null = null;
      try { saved = sessionStorage.getItem(selectedSetKey(child.id)); } catch {}
      const today = getTodayString();
      const pick =
        list.find((s) => s.id === saved) ??
        list.find((s) => s.source === "parent" && s.date === today) ??
        list.find((s) => s.id === lessonId) ??
        list[0];
      setSelectedId(pick?.id ?? null);
    } finally {
      setLoading(false);
    }
  }

  function selectSet(id: string) {
    setSelectedId(id);
    setShowPast(false);
    try { sessionStorage.setItem(selectedSetKey(child.id), id); } catch {}
  }

  // 주제별 단어장 목록: 처음 펼칠 때 사전과 아이 학습 상태를 불러온다
  async function toggleThemes() {
    const open = !showThemes;
    setShowThemes(open);
    if (!open || themes) return;
    const [dict, learned] = await Promise.all([getDictionary(), getLearnedWords(child.id)]);
    const byTheme = new Map<string, ThemeInfo>();
    for (const w of dict) {
      const t = byTheme.get(w.theme) ?? { theme: w.theme, level: w.level, total: 0, learned: 0 };
      t.level = Math.min(t.level, w.level);
      t.total += 1;
      if (learned.has(w.english)) t.learned += 1;
      byTheme.set(w.theme, t);
    }
    setThemes(Array.from(byTheme.values()).sort((a, b) => a.level - b.level || a.theme.localeCompare(b.theme)));
  }

  async function openTheme(theme: string) {
    setThemeBusy(theme);
    const id = await createThemeLesson(child.id, theme);
    if (id) {
      setSets(await getWordSetsByChild(child.id, 30));
      selectSet(id);
      setShowThemes(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      alert("단어장을 만들지 못했어요. 잠시 후 다시 해 주세요.");
    }
    setThemeBusy(null);
  }

  function placementLaterClick() {
    setPlacementLater(true);
    try { sessionStorage.setItem(placementLaterKey(child.id), "1"); } catch {}
  }

  // 다른 자녀로 바꾸거나 부모 메뉴로 가는 화면 (부모 메뉴는 PIN 필요)
  function goProfiles() {
    window.location.assign("/profiles");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-bounce-slow">📚</div>
          <p className="text-gray-500">불러오는 중...</p>
          {slowNetwork && (
            <>
              <p className="text-xs text-gray-400 mt-2">서버 응답이 지연되고 있어요</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-3 text-sm text-primary-500 underline"
              >
                새로고침
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const wordSet = sets.find((s) => s.id === selectedId) ?? null;

  if (!wordSet || !wordSet.words || wordSet.words.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-6xl mb-4">😢</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">아직 공부할 단어가 없어요</h2>
          <p className="text-gray-500 mb-6">
            부모님에게 숙제 단어를 등록하거나
            <br />
            &quot;오늘의 학습&quot;을 켜 달라고 부탁해요!
          </p>
          <button onClick={goProfiles} className="btn-primary inline-block">프로필 바꾸기</button>
        </div>
      </div>
    );
  }

  const today = getTodayString();
  const todayLesson = sets.find((s) => s.id === todayLessonId) ?? null;
  const todayHomework = sets.filter((s) => s.source === "parent" && s.date === today);
  const todayThemes = sets.filter((s) => s.source === "theme" && s.date === today);
  const todayIds = new Set([todayLesson?.id, ...todayHomework.map((s) => s.id), ...todayThemes.map((s) => s.id)]);
  const pastSets = sets.filter((s) => !todayIds.has(s.id));
  const showPlacement = !!childInfo && childInfo.auto_lesson && !childInfo.placement_done_at && !placementLater;
  const lessonNew = todayLesson?.words?.filter((w) => w.lesson_role === "new").length ?? 0;
  const lessonReview = todayLesson?.words?.filter((w) => w.lesson_role === "review").length ?? 0;

  const totalSessions = todayStats?.totalSessions ?? 0;
  const todayScore = todayStats?.totalScore ?? 0;
  const todayRewards = todayStats?.rewardCount ?? 0;

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">공부하기 📚</h1>
            <p className="text-sm text-gray-500">{child.name} 화이팅!</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-white px-3 py-1.5 rounded-full shadow-sm">
              <Trophy className="w-4 h-4 text-kid-yellow" />
              <span className="font-bold text-gray-800 text-sm">{todayRewards}</span>
            </div>
            <button
              onClick={goProfiles}
              className="p-2 text-gray-400 hover:text-primary-500 hover:bg-primary-50 rounded-xl transition-colors"
              title="프로필 바꾸기"
              aria-label="프로필 바꾸기"
            >
              <Users className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 오늘의 목표 · 연속 학습 · 도장판 */}
        {goal && <DailyGoalCard status={goal} />}

        {/* Today Score Dashboard */}
        <div className="bg-white rounded-3xl p-6 shadow-md mb-6">
          <div className="flex items-center gap-6">
            <ScoreGauge score={todayScore} />
            <div className="flex-1">
              <h2 className="text-lg font-bold text-gray-800 mb-3">오늘의 학습 현황</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 rounded-2xl p-3 text-center">
                  <div className="text-2xl font-extrabold text-blue-600">{totalSessions}</div>
                  <div className="text-xs text-blue-500 mt-0.5">완료한 학습</div>
                </div>
                <div className="bg-purple-50 rounded-2xl p-3 text-center">
                  <div className="text-2xl font-extrabold text-purple-600">
                    {Object.keys(todayStats?.moduleStats ?? {}).length}
                  </div>
                  <div className="text-xs text-purple-500 mt-0.5">참여 모듈</div>
                </div>
              </div>
              {totalSessions > 0 && (
                <button
                  onClick={loadData}
                  className="mt-3 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" /> 새로고침
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 레벨 테스트 안내 (아직 안 본 아이) */}
        {showPlacement && (
          <div className="bg-gradient-to-r from-indigo-500 to-primary-500 rounded-3xl p-5 shadow-md mb-6 text-white flex items-center gap-4">
            <div className="text-4xl">🎯</div>
            <div className="flex-1 min-w-0">
              <p className="font-bold">레벨 테스트</p>
              <p className="text-sm text-blue-100">3분이면 내 수준에 딱 맞는 단어부터 공부할 수 있어요</p>
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <Link href="/student/placement" className="px-4 py-2 bg-white text-primary-600 font-bold rounded-xl text-sm text-center">
                시작
              </Link>
              <button onClick={placementLaterClick} className="text-xs text-blue-100">다음에</button>
            </div>
          </div>
        )}

        {/* 오늘 할 공부: 오늘의 학습 + 오늘 숙제 + 오늘 고른 단어장 */}
        {(todayLesson || todayHomework.length > 0 || todayThemes.length > 0) && (
          <div className="mb-6">
            <h2 className="text-lg font-bold text-gray-800 mb-3">오늘 할 공부</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {todayLesson && (
                <SetChoice
                  selected={selectedId === todayLesson.id}
                  onClick={() => selectSet(todayLesson.id)}
                  emoji="🌟"
                  title="오늘의 학습"
                  detail={[lessonNew > 0 && `새 단어 ${lessonNew}개`, lessonReview > 0 && `복습 ${lessonReview}개`]
                    .filter(Boolean)
                    .join(" · ")}
                  note={todayLesson.note ?? undefined}
                />
              )}
              {todayHomework.map((s) => (
                <SetChoice
                  key={s.id}
                  selected={selectedId === s.id}
                  onClick={() => selectSet(s.id)}
                  emoji="📝"
                  title={`숙제: ${setLabel(s)}`}
                  detail={`단어 ${s.words?.length ?? 0}개`}
                />
              ))}
              {todayThemes.map((s) => (
                <SetChoice
                  key={s.id}
                  selected={selectedId === s.id}
                  onClick={() => selectSet(s.id)}
                  emoji="📚"
                  title={setLabel(s)}
                  detail={`단어 ${s.words?.length ?? 0}개`}
                />
              ))}
            </div>
          </div>
        )}

        {/* 지금 공부할 단어 */}
        <div className="bg-white rounded-3xl p-6 shadow-md mb-6">
          <div className="flex items-center justify-between mb-4 gap-2">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary-500" />
              {setLabel(wordSet)} ({wordSet.words.length}개)
            </h2>
            <span className="text-sm text-gray-400 shrink-0">{formatDateShort(wordSet.date)}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {wordSet.words.map((word) => (
              <span
                key={word.id}
                className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                  word.lesson_role === "review" ? "bg-orange-50 text-orange-700" : "bg-primary-50 text-primary-700"
                }`}
              >
                {word.english}
                {word.lesson_role === "new" && <span className="ml-1 text-[10px] font-bold text-primary-400">NEW</span>}
              </span>
            ))}
          </div>
          {wordSet.words.some((w) => w.lesson_role === "review") && (
            <p className="text-xs text-orange-500 mt-3 flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> 주황색 단어는 잊어버리기 전에 다시 보는 복습 단어예요
            </p>
          )}

          {pastSets.length > 0 && (
            <div className="mt-4 border-t pt-3">
              <button
                onClick={() => setShowPast((v) => !v)}
                className="text-sm font-medium text-gray-500 hover:text-gray-700"
              >
                {showPast ? "▲ 지난 공부 접기" : `▼ 지난 공부 다시 하기 (${pastSets.length})`}
              </button>
              {showPast && (
                <div className="mt-2 space-y-1 max-h-64 overflow-y-auto">
                  {pastSets.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => selectSet(s.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm text-left ${
                        selectedId === s.id ? "bg-primary-50 text-primary-700" : "hover:bg-gray-50 text-gray-700"
                      }`}
                    >
                      <span className="truncate">
                        {setEmoji(s)} {setLabel(s)}
                      </span>
                      <span className="text-gray-400 shrink-0 ml-2">
                        {formatDateShort(s.date)} · {s.words?.length ?? 0}개
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 주제별 단어장: 아이가 직접 골라 공부 */}
        <div className="bg-white rounded-3xl p-5 shadow-md mb-6">
          <button
            onClick={toggleThemes}
            className="w-full flex items-center justify-between text-left"
            aria-expanded={showThemes}
          >
            <span className="text-lg font-bold text-gray-800">📚 주제별 단어장</span>
            <span className="text-sm text-gray-400">{showThemes ? "접기 ▲" : "골라서 공부하기 ▼"}</span>
          </button>
          {showThemes && (
            <div className="mt-4">
              {!themes ? (
                <p className="text-sm text-gray-400">불러오는 중...</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {themes.map((t) => (
                    <button
                      key={t.theme}
                      onClick={() => openTheme(t.theme)}
                      disabled={!!themeBusy}
                      className="flex items-center gap-2 p-3 rounded-2xl bg-gray-50 hover:bg-primary-50 text-left disabled:opacity-50"
                    >
                      <span className="text-2xl">{THEME_EMOJI[t.theme] ?? "📖"}</span>
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-gray-800 truncate">{t.theme}</span>
                        <span className="block text-xs text-gray-400">
                          {themeBusy === t.theme ? "만드는 중..." : `${t.learned}/${t.total} 배움`}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* TTS 발음 방식 선택 */}
        <TtsModeToggle />

        {/* Module Grid */}
        <h2 className="text-lg font-bold text-gray-800 mb-4">단어 학습</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {MODULE_LIST.filter((m) => !m.group).map((module) => (
            <ModuleCard
              key={module.type}
              module={module}
              wordSetId={wordSet.id}
              stat={todayStats?.moduleStats[module.type]}
            />
          ))}
        </div>

        {/* 문장 학습: 사전 예문이 있는 단어로 */}
        <h2 className="text-lg font-bold text-gray-800 mt-8 mb-1">문장 학습</h2>
        <p className="text-sm text-gray-500 mb-4">
          {wordSet.words.some((w) => w.dictionary_words)
            ? "단어가 들어간 예문으로 공부해요"
            : "이 단어들에는 예문이 없어요. 오늘의 학습이나 단어장으로 해 보세요"}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {MODULE_LIST.filter((m) => m.group === "sentence").map((module) => (
            <ModuleCard
              key={module.type}
              module={module}
              wordSetId={wordSet.id}
              stat={todayStats?.moduleStats[module.type]}
            />
          ))}
        </div>

        {/* 오늘의 시험 - 모든 모듈 완료 시 활성화 */}
        <ExamCard wordSetId={wordSet.id} moduleStats={todayStats?.moduleStats ?? {}} />
      </div>

      {celebrate && goal && (
        <GoalCelebration
          status={goal}
          onClose={() => {
            setCelebrate(false);
            try { localStorage.setItem(celebratedKey(child.id, goal.today), "1"); } catch {}
          }}
        />
      )}
    </div>
  );
}

function ExamCard({
  wordSetId,
  moduleStats,
}: {
  wordSetId: string;
  moduleStats: Record<string, { sessionCount: number; bestScore: number; hasPerfect: boolean }>;
}) {
  const requiredModules: ModuleType[] = ["flashcard", "quiz", "matching", "spelling", "scramble", "listening", "speed"];
  const completedCount = requiredModules.filter((m) => (moduleStats[m]?.sessionCount ?? 0) > 0).length;
  const unlocked = completedCount === requiredModules.length;
  const examStat = moduleStats["exam"];
  const examDone = (examStat?.sessionCount ?? 0) > 0;
  const examPerfect = examStat?.hasPerfect ?? false;

  if (!unlocked) {
    return (
      <div className="mt-8 bg-gradient-to-br from-gray-100 to-gray-200 rounded-3xl p-6 shadow-md relative overflow-hidden">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-gray-300 rounded-2xl flex items-center justify-center">
            <Lock className="w-8 h-8 text-gray-500" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-bold text-gray-600">🎓 오늘의 시험</h3>
              <span className="text-xs bg-gray-300 text-gray-600 px-2 py-0.5 rounded-full font-medium">잠김</span>
            </div>
            <p className="text-sm text-gray-500 mb-2">
              모든 학습 모듈을 한 번씩 완료하면 도전할 수 있어요
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-gray-300 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-yellow-400 to-orange-400 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${(completedCount / requiredModules.length) * 100}%` }}
                />
              </div>
              <span className="text-xs font-bold text-gray-600">
                {completedCount} / {requiredModules.length}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Link href={`/student/exam?setId=${wordSetId}`}>
      <div className="mt-8 bg-gradient-to-br from-yellow-400 via-orange-400 to-red-400 rounded-3xl p-6 shadow-xl relative overflow-hidden cursor-pointer hover:scale-[1.02] transition-transform">
        {/* 반짝이는 배경 효과 */}
        <div className="absolute -right-8 -top-8 w-32 h-32 bg-white opacity-10 rounded-full" />
        <div className="absolute -left-4 -bottom-4 w-20 h-20 bg-white opacity-10 rounded-full" />

        {examPerfect && (
          <div className="absolute top-3 right-3 bg-white text-yellow-600 text-xs font-bold px-2 py-1 rounded-full shadow flex items-center gap-1">
            👑 만점!
          </div>
        )}

        <div className="flex items-center gap-4 relative z-10">
          <div className="w-16 h-16 bg-white bg-opacity-25 backdrop-blur-sm rounded-2xl flex items-center justify-center">
            <Award className="w-9 h-9 text-white" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-xl font-extrabold text-white">🎓 오늘의 시험</h3>
              <span className="text-xs bg-white text-orange-600 px-2 py-0.5 rounded-full font-bold">FINAL</span>
            </div>
            <p className="text-sm text-white text-opacity-90 mb-2">
              {examDone ? "한 번 더 도전해서 점수를 올려보세요!" : "최종 평가에 도전하세요"}
            </p>
            {examDone && (
              <div className="inline-flex items-center gap-1 bg-white bg-opacity-25 backdrop-blur-sm text-white text-xs font-bold px-2.5 py-1 rounded-full">
                {examStat!.sessionCount}회 응시 · 최고 {examStat!.bestScore}점
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

function ModuleCard({
  module,
  wordSetId,
  stat,
}: {
  module: ModuleInfo;
  wordSetId: string;
  stat?: { sessionCount: number; bestScore: number; hasPerfect: boolean };
}) {
  const IconComponent = iconMap[module.icon];
  const done = (stat?.sessionCount ?? 0) > 0;
  const perfect = stat?.hasPerfect ?? false;

  return (
    <Link href={`/student/${module.type}?setId=${wordSetId}`}>
      <div className={`module-card text-center group relative ${done ? "ring-2 ring-offset-1 ring-green-300" : ""}`}>
        {/* 만점 배지 */}
        {perfect && (
          <div className="absolute -top-2 -right-2 bg-yellow-400 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow">
            만점!
          </div>
        )}
        <div className={`w-14 h-14 ${module.bgColor} rounded-2xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform`}>
          {IconComponent && <IconComponent className={`w-7 h-7 ${module.color}`} />}
        </div>
        <h3 className="font-bold text-gray-800 text-sm mb-1">{module.title}</h3>
        <p className="text-xs text-gray-400 mb-2">{module.description}</p>
        {done ? (
          <div className="flex items-center justify-center gap-1">
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
              {stat!.sessionCount}회 · 최고 {stat!.bestScore}%
            </span>
          </div>
        ) : (
          <span className="text-xs text-gray-300">미완료</span>
        )}
      </div>
    </Link>
  );
}
