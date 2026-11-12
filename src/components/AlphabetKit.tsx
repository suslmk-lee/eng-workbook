"use client";

// 알파벳 익히기 화면들이 함께 쓰는 조각
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { addReward, getAlphabetProgress } from "@/lib/api";
import type { LetterProgress } from "@/lib/alphabet";

export function useAlphabetProgress(childId: string) {
  const [progress, setProgress] = useState<Record<string, LetterProgress> | null>(null);
  const reload = useCallback(() => {
    getAlphabetProgress(childId).then(setProgress);
  }, [childId]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { progress, reload };
}

export function masteredCount(progress: Record<string, LetterProgress> | null): number {
  return progress ? Object.values(progress).filter((p) => p.mastered).length : 0;
}

// 끝났을 때 보상 (다른 학습과 같은 기준: 만점 트로피, 80% 이상 별)
export async function rewardAlphabet(title: string, correct: number, total: number, childId: string) {
  if (total === 0) return;
  if (correct === total) await addReward("trophy", `${title} 만점! 🏆`, "alphabet", childId);
  else if (correct >= total * 0.8) await addReward("star", `${title} 80% 이상! ⭐`, "alphabet", childId);
}

export function AlphabetHeader({ title, index, total }: { title: string; index?: number; total?: number }) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <Link href="/student/alphabet" className="p-2 text-gray-500 hover:bg-white rounded-xl" aria-label="뒤로">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <h1 className="text-xl font-bold text-gray-800">{title}</h1>
        <span className="text-sm text-gray-500 w-10 text-right">{total ? `${Math.min((index ?? 0) + 1, total)}/${total}` : ""}</span>
      </div>
      {total ? (
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-yellow-400 to-orange-400 transition-all" style={{ width: `${((index ?? 0) / total) * 100}%` }} />
        </div>
      ) : null}
    </div>
  );
}

export function AlphabetResult({
  title,
  correct,
  total,
  onRetry,
}: {
  title: string;
  correct: number;
  total: number;
  onRetry: () => void;
}) {
  const perfect = correct === total;
  return (
    <div className="bg-white rounded-3xl shadow-md p-8 text-center" aria-label="결과">
      <div className="text-6xl mb-3" aria-hidden>
        {perfect ? "🏆" : correct >= total * 0.8 ? "⭐" : "💪"}
      </div>
      <h2 className="text-2xl font-extrabold text-gray-800">{title} 끝!</h2>
      <p className="text-xl text-gray-700 mt-2">
        <b className="text-orange-500">{correct}</b> / {total}
      </p>
      <p className="text-gray-500 mt-1">{perfect ? "모두 맞혔어요!" : "조금만 더 연습하면 다 알 수 있어요!"}</p>
      <div className="flex gap-3 justify-center mt-6">
        <button onClick={onRetry} className="btn-kid bg-kid-blue inline-flex items-center gap-1">
          <RotateCcw className="w-5 h-5" />
          다시 하기
        </button>
        <Link href="/student/alphabet" className="btn-kid bg-kid-green">
          알파벳으로
        </Link>
      </div>
    </div>
  );
}

// 학생 홈의 알파벳 입구. highlight: 영어가 처음인 아이에게 위쪽에 크게
export function AlphabetEntryCard({ mastered, highlight }: { mastered: number; highlight: boolean }) {
  const done = mastered >= 26;
  return (
    <Link
      href="/student/alphabet"
      aria-label="알파벳 익히기"
      className={`flex items-center gap-4 rounded-3xl p-5 shadow-md mb-6 transition-transform active:scale-[0.98] ${
        highlight ? "bg-gradient-to-r from-yellow-300 to-orange-300 text-gray-900" : "bg-white text-gray-800"
      }`}
    >
      <span className="text-4xl" aria-hidden>
        🔤
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-lg font-bold">
          {highlight && !done ? "영어가 처음이라면 알파벳부터!" : "알파벳 익히기"}
        </span>
        <span className={`block text-sm ${highlight ? "text-gray-800" : "text-gray-500"}`}>
          {done ? "26자를 모두 익혔어요! 복습해 볼까요?" : `익힌 글자 ${mastered} / 26 · 대문자·소문자와 글자 이름을 익혀요`}
        </span>
      </span>
      <span className="text-2xl" aria-hidden>
        ›
      </span>
    </Link>
  );
}

// 부모 화면(학습 현황): 글자별로 익혔는지 한눈에
export function AlphabetSummary({ progress }: { progress: Record<string, LetterProgress> }) {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const mastered = masteredCount(progress);
  return (
    <div className="bg-white rounded-3xl p-6 shadow-md" aria-label="알파벳 현황">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-lg font-bold text-gray-800">알파벳</h3>
        <span className="text-sm text-gray-500">익힌 글자 {mastered} / 26</span>
      </div>
      <div className="grid grid-cols-[repeat(9,minmax(0,1fr))] sm:grid-cols-[repeat(13,minmax(0,1fr))] gap-1">
        {letters.map((l) => {
          const p = progress[l];
          return (
            <div
              key={l}
              data-letter={l}
              data-state={p?.mastered ? "mastered" : p ? "practicing" : "none"}
              title={p ? `맞힘 ${p.correct}번${p.mastered ? " · 익힘" : ""}` : "아직 안 했어요"}
              className={`aspect-square rounded-lg flex items-center justify-center text-sm font-bold ${
                p?.mastered ? "bg-green-100 text-green-700" : p ? "bg-yellow-50 text-yellow-700" : "bg-gray-50 text-gray-300"
              }`}
            >
              {l}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-400 mt-3">초록: 익힌 글자(3번 연속 정답) · 노랑: 연습 중 · 회색: 아직 안 해 봄</p>
    </div>
  );
}

export function AlphabetLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-4xl animate-bounce-slow">🔤</div>
    </div>
  );
}
