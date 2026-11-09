"use client";

// 문장 학습 모듈 3종(빈칸·순서·따라 말하기)이 함께 쓰는 화면 조각과 로직
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RotateCcw, Volume2 } from "lucide-react";
import { Word, ModuleType } from "@/lib/types";
import { getWordSetForChild, addReward } from "@/lib/api";
import { buildSentenceItems, SentenceItem } from "@/lib/sentence";
import { speakEnglish } from "@/lib/speech";

export const MIN_SENTENCES = 3;

// 세트를 불러와 문제(예문)를 만든다. regenerate()로 다시 섞기
export function useSentenceItems(
  childId: string,
  setId: string | null,
  filter?: (item: SentenceItem) => boolean
) {
  const [loading, setLoading] = useState(true);
  const [words, setWords] = useState<Word[]>([]);
  const [items, setItems] = useState<SentenceItem[]>([]);

  useEffect(() => {
    getWordSetForChild(childId, setId).then((set) => {
      const list = set?.words ?? [];
      setWords(list);
      setItems(buildSentenceItems(list, 10, filter));
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId, setId]);

  return {
    loading,
    words,
    items,
    regenerate: () => setItems(buildSentenceItems(words, 10, filter)),
  };
}

// 끝났을 때 보상 (다른 모듈과 같은 기준: 만점 트로피, 80% 이상 별)
export async function rewardSentenceSession(
  moduleType: ModuleType,
  title: string,
  correct: number,
  total: number,
  childId: string
) {
  if (total === 0) return;
  if (correct === total) await addReward("trophy", `${title} 만점! 🏆`, moduleType, childId);
  else if (correct >= total * 0.8) await addReward("star", `${title} 80% 이상! ⭐`, moduleType, childId);
}

export function SentenceHeader({ title, index, total }: { title: string; index: number; total: number }) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <Link href="/student" className="p-2 text-gray-500 hover:bg-white rounded-xl" aria-label="뒤로">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <h1 className="text-xl font-bold text-gray-800">{title}</h1>
        <span className="text-sm font-medium text-gray-500 w-12 text-right">
          {Math.min(index + 1, total)}/{total}
        </span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-full bg-primary-500 transition-all" style={{ width: `${(index / total) * 100}%` }} />
      </div>
    </div>
  );
}

export function SentenceLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-4xl animate-bounce-slow">📖</div>
    </div>
  );
}

export function SentenceEmpty({ title }: { title: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-md p-8 max-w-md text-center">
        <div className="text-5xl mb-4">📖</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">{title}</h2>
        <p className="text-gray-500 mb-6">
          이 단어들에는 예문이 부족해요.
          <br />
          <b>오늘의 학습</b>이나 <b>주제별 단어장</b>을 골라서 해 보세요.
        </p>
        <Link href="/student" className="btn-kid bg-kid-blue inline-block">
          돌아가기
        </Link>
      </div>
    </div>
  );
}

// 한 문제가 끝났을 때 보여주는 정답 문장 (듣기 버튼 포함)
export function SentenceAnswer({ item, correct }: { item: SentenceItem; correct: boolean }) {
  return (
    <div className={`rounded-2xl p-4 mt-4 ${correct ? "bg-green-50" : "bg-red-50"}`}>
      <p className={`font-bold mb-1 ${correct ? "text-green-600" : "text-red-500"}`}>
        {correct ? "정답이에요! 🎉" : "아쉬워요! 정답은"}
      </p>
      <div className="flex items-center gap-2">
        <p className="text-lg font-medium text-gray-800">{item.sentence}</p>
        <button
          onClick={() => speakEnglish(item.sentence, 0.85)}
          className="p-1.5 bg-white rounded-full shadow-sm shrink-0"
          aria-label="문장 듣기"
        >
          <Volume2 className="w-4 h-4 text-blue-600" />
        </button>
      </div>
      <p className="text-sm text-gray-500">{item.translation}</p>
    </div>
  );
}

export function SentenceResult({
  title,
  results,
  onRetry,
}: {
  title: string;
  results: { item: SentenceItem; correct: boolean }[];
  onRetry: () => void;
}) {
  const correct = results.filter((r) => r.correct).length;
  const pct = results.length ? Math.round((correct / results.length) * 100) : 0;
  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-2xl mx-auto text-center py-10">
        <div className="text-6xl mb-4">{pct === 100 ? "🏆" : pct >= 80 ? "🌟" : pct >= 60 ? "👍" : "💪"}</div>
        <h2 className="text-3xl font-bold text-gray-800 mb-2">{title} 끝!</h2>
        <p className="text-5xl font-extrabold my-6">
          <span className={pct >= 80 ? "text-green-600" : pct >= 60 ? "text-yellow-600" : "text-red-500"}>{correct}</span>
          <span className="text-gray-300"> / {results.length}</span>
        </p>
        <div className="bg-white rounded-2xl p-5 shadow-md mb-8 text-left space-y-3">
          {results.map(({ item, correct: ok }, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <span>{ok ? "✅" : "❌"}</span>
              <span className="min-w-0">
                <span className="block font-medium text-gray-800">{item.sentence}</span>
                <span className="block text-gray-500">{item.translation}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="flex gap-3 justify-center">
          <button onClick={onRetry} className="btn-kid bg-kid-blue">
            <RotateCcw className="w-5 h-5 inline mr-2" />
            다시 하기
          </button>
          <Link href="/student" className="btn-kid bg-kid-green">
            다른 학습
          </Link>
        </div>
      </div>
    </div>
  );
}
