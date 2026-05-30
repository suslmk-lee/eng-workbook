"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
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
  LogOut,
  Trophy,
  Flame,
  RotateCcw,
  Award,
  Lock,
} from "lucide-react";
import { WordSet, MODULE_LIST, ModuleInfo, ModuleType } from "@/lib/types";
import { getLatestWordSet, getWordsForReview, getTodayStats, TodayStats } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

const iconMap: Record<string, any> = {
  Layers, CircleHelp, Puzzle, PenLine, Shuffle, Headphones, Zap,
};

const MODULE_TITLES: Record<ModuleType, string> = {
  flashcard: "플래시카드",
  quiz: "4지선다",
  matching: "매칭",
  spelling: "스펠링",
  scramble: "스크램블",
  listening: "듣기",
  speed: "스피드",
  exam: "시험",
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

export default function StudentPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const [wordSet, setWordSet] = useState<WordSet | null>(null);
  const [reviewCount, setReviewCount] = useState(0);
  const [todayStats, setTodayStats] = useState<TodayStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [slowNetwork, setSlowNetwork] = useState(false);

  const userId = user?.id;
  // profile이 아직 fetch되지 않았으면 user_metadata의 role을 사용
  const role = profile?.role ?? (user?.user_metadata?.role as string | undefined);

  useEffect(() => {
    if (authLoading) return;
    if (!userId) { router.replace("/login"); return; }
    if (!role) { router.replace("/login"); return; }
    if (role !== "student") { router.replace("/login"); return; }
    loadData();
  }, [userId, role, authLoading]);

  // 5초 이상 로딩 중이면 느린 연결 메시지 표시
  useEffect(() => {
    if (!authLoading && !loading) { setSlowNetwork(false); return; }
    const tid = setTimeout(() => setSlowNetwork(true), 5000);
    return () => clearTimeout(tid);
  }, [authLoading, loading]);

  async function loadData() {
    if (!user) return;
    setLoading(true);
    try {
      const [ws, reviewWords, stats] = await Promise.all([
        getLatestWordSet(user.id),
        getWordsForReview(user.id),
        getTodayStats(user.id),
      ]);
      setWordSet(ws);
      setReviewCount(reviewWords?.length ?? 0);
      setTodayStats(stats);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  if (authLoading || loading) {
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

  if (!wordSet || !wordSet.words || wordSet.words.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-6xl mb-4">😢</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">아직 단어가 없어요</h2>
          <p className="text-gray-500 mb-6">부모님에게 오늘의 단어를 등록해달라고 부탁해요!</p>
          <button onClick={handleSignOut} className="btn-primary inline-block">로그아웃</button>
        </div>
      </div>
    );
  }

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
            <p className="text-sm text-gray-500">{profile?.name}님 화이팅!</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-white px-3 py-1.5 rounded-full shadow-sm">
              <Trophy className="w-4 h-4 text-kid-yellow" />
              <span className="font-bold text-gray-800 text-sm">{todayRewards}</span>
            </div>
            <button
              onClick={handleSignOut}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
              title="로그아웃"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

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

        {/* Today's Words */}
        <div className="bg-white rounded-3xl p-6 shadow-md mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary-500" />
              오늘의 단어 ({wordSet.words.length}개)
            </h2>
            <span className="text-sm text-gray-400">{wordSet.title}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {wordSet.words.map((word) => (
              <span key={word.id} className="bg-primary-50 text-primary-700 px-3 py-1.5 rounded-full text-sm font-medium">
                {word.english}
              </span>
            ))}
          </div>
        </div>

        {/* Review Alert */}
        {reviewCount > 0 && (
          <div className="bg-gradient-to-r from-orange-100 to-yellow-100 rounded-2xl p-4 mb-6 flex items-center gap-3">
            <RefreshCw className="w-6 h-6 text-orange-500 flex-shrink-0" />
            <div>
              <span className="font-bold text-orange-800">복습할 단어가 있어요!</span>
              <span className="text-sm text-orange-600 ml-2">{reviewCount}개</span>
            </div>
          </div>
        )}

        {/* Module Grid */}
        <h2 className="text-lg font-bold text-gray-800 mb-4">학습 모듈 선택</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {MODULE_LIST.map((module) => (
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
