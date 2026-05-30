"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, RotateCcw, Clock } from "lucide-react";
import { Word, WordSet } from "@/lib/types";
import { getWordSets, saveBatchLearningRecords, addReward } from "@/lib/api";
import { shuffleArray, cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

interface Card {
  id: string;
  text: string;
  wordId: string;
  type: "english" | "korean";
  matched: boolean;
}

function MatchingContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const setId = searchParams.get("setId");
  const [words, setWords] = useState<Word[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [selected, setSelected] = useState<Card | null>(null);
  const [matchedPairs, setMatchedPairs] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [timer, setTimer] = useState(0);
  const [gameActive, setGameActive] = useState(false);
  const [finished, setFinished] = useState(false);
  const [wrongPair, setWrongPair] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWords();
  }, [setId]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (gameActive && !finished) {
      interval = setInterval(() => setTimer((t) => t + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [gameActive, finished]);

  async function loadWords() {
    const sets = await getWordSets();
    const targetSet = sets.find((s: WordSet) => s.id === setId) || sets[0];
    if (targetSet?.words) {
      setWords(targetSet.words);
      initGame(targetSet.words);
    }
    setLoading(false);
  }

  function initGame(wordList: Word[]) {
    const gameWords = wordList.slice(0, 6);
    const engCards: Card[] = gameWords.map((w) => ({
      id: `en-${w.id}`,
      text: w.english,
      wordId: w.id,
      type: "english",
      matched: false,
    }));
    const korCards: Card[] = gameWords.map((w) => ({
      id: `kr-${w.id}`,
      text: w.korean,
      wordId: w.id,
      type: "korean",
      matched: false,
    }));
    setCards(shuffleArray([...engCards, ...korCards]));
    setSelected(null);
    setMatchedPairs(0);
    setAttempts(0);
    setTimer(0);
    setGameActive(true);
    setFinished(false);
    setWrongPair([]);
  }

  function handleCardClick(card: Card) {
    if (card.matched || wrongPair.length > 0) return;
    if (selected?.id === card.id) return;

    if (!selected) {
      setSelected(card);
      return;
    }

    if (selected.type === card.type) {
      setSelected(card);
      return;
    }

    setAttempts((a) => a + 1);

    if (selected.wordId === card.wordId) {
      const newCards = cards.map((c) =>
        c.wordId === card.wordId ? { ...c, matched: true } : c
      );
      setCards(newCards);
      setMatchedPairs((m) => m + 1);
      setSelected(null);

      const totalPairs = cards.length / 2;
      if (matchedPairs + 1 === totalPairs) {
        finishGame();
      }
    } else {
      setWrongPair([selected.id, card.id]);
      setTimeout(() => {
        setWrongPair([]);
        setSelected(null);
      }, 800);
    }
  }

  async function finishGame() {
    setFinished(true);
    setGameActive(false);

    const uniqueWords = [...new Set(cards.map((c) => c.wordId))];
    const records = uniqueWords.map((wordId) => ({
      wordId,
      moduleType: "matching" as const,
      isCorrect: true,
    }));
    await saveBatchLearningRecords(records, user?.id);

    const totalPairs = cards.length / 2;
    if (attempts <= totalPairs) {
      await addReward("trophy", "매칭 게임 최소 시도! 🏆", "matching", user?.id);
    } else {
      await addReward("star", `매칭 게임 완료 (${attempts}회 시도)! ⭐`, "matching", user?.id);
    }
  }

  function handleRetry() {
    initGame(words);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-4xl animate-bounce-slow">🧩</div>
      </div>
    );
  }

  const totalPairs = cards.length / 2;

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/student" className="p-2 hover:bg-white rounded-xl transition-colors">
              <ArrowLeft className="w-6 h-6 text-gray-600" />
            </Link>
            <h1 className="text-2xl font-bold text-gray-800">매칭 게임</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 text-sm text-gray-500">
              <Clock className="w-4 h-4" />
              {timer}초
            </div>
            <div className="text-sm text-gray-500">
              시도: {attempts}회
            </div>
          </div>
        </div>

        {/* Progress */}
        <div className="text-center mb-6">
          <span className="badge bg-green-100 text-green-700">
            {matchedPairs} / {totalPairs} 매칭 완료
          </span>
        </div>

        {finished ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">매칭 완료!</h2>
            <p className="text-gray-500 mb-2">
              {timer}초 · {attempts}회 시도
            </p>
            <p className="text-sm text-gray-400 mb-6">
              {attempts <= totalPairs ? "완벽해요! 최소 시도로 클리어!" : "잘했어요!"}
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={handleRetry} className="btn-kid bg-kid-blue">
                <RotateCcw className="w-5 h-5 inline mr-2" />
                다시하기
              </button>
              <Link href="/student" className="btn-kid bg-kid-green">
                다른 학습
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
            {cards.map((card) => {
              const isSelected = selected?.id === card.id;
              const isWrong = wrongPair.includes(card.id);
              return (
                <button
                  key={card.id}
                  onClick={() => handleCardClick(card)}
                  disabled={card.matched}
                  className={cn(
                    "aspect-square rounded-2xl p-3 text-center font-bold transition-all duration-200",
                    "flex items-center justify-center text-sm md:text-base",
                    card.matched && "bg-green-100 text-green-600 border-2 border-green-300 opacity-60",
                    !card.matched && !isSelected && !isWrong && "bg-white shadow-md hover:shadow-lg border-2 border-gray-200 hover:border-primary-300",
                    isSelected && "bg-primary-100 border-2 border-primary-500 shadow-lg scale-105",
                    isWrong && "bg-red-100 border-2 border-red-400 animate-wiggle",
                    card.type === "english" ? "text-blue-700" : "text-gray-700"
                  )}
                >
                  {card.text}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MatchingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-4xl animate-bounce-slow">🧩</div></div>}>
      <MatchingContent />
    </Suspense>
  );
}
