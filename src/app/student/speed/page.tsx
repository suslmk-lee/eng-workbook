"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, RotateCcw, Zap, Clock } from "lucide-react";
import { Word, WordSet } from "@/lib/types";
import { getWordSets, saveBatchLearningRecords, addReward } from "@/lib/api";
import { shuffleArray, cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import AnswerFeedback from "@/components/AnswerFeedback";
import { playCorrectSound, playWrongSound, playComboSound } from "@/lib/sound";

interface SpeedQuestion {
  word: Word;
  options: string[];
  correctIndex: number;
}

function SpeedContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const setId = searchParams.get("setId");
  const [words, setWords] = useState<Word[]>([]);
  const [questions, setQuestions] = useState<SpeedQuestion[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [gameState, setGameState] = useState<"ready" | "playing" | "finished">("ready");
  const [results, setResults] = useState<{ wordId: string; correct: boolean }[]>([]);
  const [flash, setFlash] = useState<"correct" | "wrong" | null>(null);
  const [feedback, setFeedback] = useState<{ show: boolean; isCorrect: boolean }>({ show: false, isCorrect: false });
  const [combo, setCombo] = useState(0);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadWords();
  }, [setId]);

  useEffect(() => {
    if (gameState === "playing" && timeLeft > 0) {
      timerRef.current = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    } else if (timeLeft === 0 && gameState === "playing") {
      endGame();
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [timeLeft, gameState]);

  async function loadWords() {
    const sets = await getWordSets();
    const targetSet = sets.find((s: WordSet) => s.id === setId) || sets[0];
    if (targetSet?.words) {
      setWords(targetSet.words);
    }
    setLoading(false);
  }

  function generateQuestions(wordList: Word[]): SpeedQuestion[] {
    const qs: SpeedQuestion[] = [];
    for (let round = 0; round < 5; round++) {
      wordList.forEach((word, i) => {
        const otherWords = wordList.filter((_, idx) => idx !== i);
        const distractors = shuffleArray(otherWords).slice(0, 3);
        const correctAnswer = word.korean;
        const options = shuffleArray([
          correctAnswer,
          ...distractors.map((d) => d.korean),
        ]);
        qs.push({
          word,
          options,
          correctIndex: options.indexOf(correctAnswer),
        });
      });
    }
    return shuffleArray(qs);
  }

  function startGame() {
    const qs = generateQuestions(words);
    setQuestions(qs);
    setCurrentQ(0);
    setScore(0);
    setTimeLeft(60);
    setResults([]);
    setGameState("playing");
  }

  function handleSelect(index: number) {
    const q = questions[currentQ];
    const correct = index === q.correctIndex;
    setResults([...results, { wordId: q.word.id, correct }]);

    const newCombo = correct ? combo + 1 : 0;
    setCombo(newCombo);

    // 효과음 재생
    if (correct) {
      playCorrectSound();
      if (newCombo >= 2) playComboSound(newCombo);
    } else {
      playWrongSound();
    }

    if (correct) {
      setScore((s) => s + 1);
      setFlash("correct");
      setFeedback({ show: true, isCorrect: true });
      setTimeout(() => setFeedback((f) => ({ ...f, show: false })), 280);
    } else {
      setFlash("wrong");
      setFeedback({ show: true, isCorrect: false });
      setTimeout(() => setFeedback((f) => ({ ...f, show: false })), 280);
    }

    setTimeout(() => {
      setFlash(null);
      if (currentQ < questions.length - 1) {
        setCurrentQ(currentQ + 1);
      } else {
        endGame();
      }
    }, 300);
  }

  async function endGame() {
    setGameState("finished");
    if (timerRef.current) clearTimeout(timerRef.current);

    const records = results.map((r) => ({
      wordId: r.wordId,
      moduleType: "speed" as const,
      isCorrect: r.correct,
    }));
    if (records.length > 0) {
      await saveBatchLearningRecords(records, user?.id);
    }

    if (score >= 20) {
      await addReward("trophy", `스피드 퀴즈 ${score}점! 🏆`, "speed", user?.id);
    } else if (score >= 10) {
      await addReward("star", `스피드 퀴즈 ${score}점! ⭐`, "speed", user?.id);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-4xl animate-bounce-slow">⚡</div>
      </div>
    );
  }

  if (words.length < 4) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">단어가 부족합니다 (최소 4개 필요)</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <AnswerFeedback
        show={feedback.show}
        isCorrect={feedback.isCorrect}
        combo={combo}
      />
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/student" className="p-2 hover:bg-white rounded-xl transition-colors">
              <ArrowLeft className="w-6 h-6 text-gray-600" />
            </Link>
            <h1 className="text-2xl font-bold text-gray-800">스피드 퀴즈</h1>
          </div>
          {gameState === "playing" && (
            <div className="flex items-center gap-4">
              <div className={cn(
                "flex items-center gap-1 font-bold text-lg",
                timeLeft <= 10 ? "text-red-500 animate-pulse" : "text-gray-700"
              )}>
                <Clock className="w-5 h-5" />
                {timeLeft}초
              </div>
              <div className="flex items-center gap-1 text-kid-yellow font-bold text-lg">
                <Zap className="w-5 h-5" />
                {score}점
              </div>
            </div>
          )}
        </div>

        {gameState === "ready" && (
          <div className="text-center py-20">
            <div className="text-6xl mb-6">⚡</div>
            <h2 className="text-3xl font-bold text-gray-800 mb-3">스피드 퀴즈</h2>
            <p className="text-gray-500 mb-2">60초 안에 최대한 많이 맞춰보세요!</p>
            <p className="text-sm text-gray-400 mb-8">영어 단어를 보고 한국어 뜻을 고르세요</p>
            <button onClick={startGame} className="btn-kid bg-kid-red text-xl px-10 py-4">
              <Zap className="w-6 h-6 inline mr-2" />
              시작!
            </button>
          </div>
        )}

        {gameState === "playing" && questions.length > 0 && (
          <div className={cn(
            "transition-colors duration-200 rounded-3xl",
            flash === "correct" && "bg-green-50",
            flash === "wrong" && "bg-red-50"
          )}>
            {/* Timer Bar */}
            <div className="w-full bg-gray-200 rounded-full h-3 mb-6">
              <div
                className={cn(
                  "h-3 rounded-full transition-all duration-1000",
                  timeLeft > 30 ? "bg-green-500" : timeLeft > 10 ? "bg-yellow-500" : "bg-red-500"
                )}
                style={{ width: `${(timeLeft / 60) * 100}%` }}
              />
            </div>

            <div className="bg-white rounded-3xl p-8 shadow-md mb-6 text-center">
              <p className="text-sm text-gray-400 mb-2">이 단어의 뜻은?</p>
              <h2 className="text-4xl font-bold text-gray-800">
                {questions[currentQ].word.english}
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {questions[currentQ].options.map((option, i) => (
                <button
                  key={i}
                  onClick={() => handleSelect(i)}
                  className="bg-white rounded-2xl p-5 text-center font-bold text-lg shadow-md hover:shadow-lg active:scale-95 transition-all border-2 border-gray-200 hover:border-primary-300"
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        )}

        {gameState === "finished" && (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">
              {score >= 20 ? "🏆" : score >= 10 ? "🌟" : "💪"}
            </div>
            <h2 className="text-3xl font-bold text-gray-800 mb-2">게임 종료!</h2>
            <div className="text-6xl font-extrabold text-kid-yellow my-6">
              {score}점
            </div>
            <p className="text-gray-500 mb-2">
              총 {results.length}문제 중 {results.filter((r) => r.correct).length}개 정답
            </p>
            <p className="text-sm text-gray-400 mb-8">
              {60 - timeLeft}초 소요
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={startGame} className="btn-kid bg-kid-red">
                <RotateCcw className="w-5 h-5 inline mr-2" />
                다시 도전
              </button>
              <Link href="/student" className="btn-kid bg-kid-green">
                다른 학습
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SpeedPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-4xl animate-bounce-slow">⚡</div></div>}>
      <SpeedContent />
    </Suspense>
  );
}
