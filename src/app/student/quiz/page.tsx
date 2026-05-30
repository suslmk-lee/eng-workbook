"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Volume2, RotateCcw, Trophy } from "lucide-react";
import { Word, WordSet } from "@/lib/types";
import { getWordSets, saveBatchLearningRecords, addReward } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { shuffleArray } from "@/lib/utils";
import { speakEnglish } from "@/lib/speech";
import AnswerFeedback from "@/components/AnswerFeedback";
import { playCorrectSound, playWrongSound, playComboSound } from "@/lib/sound";

interface QuizQuestion {
  word: Word;
  options: string[];
  correctIndex: number;
  mode: "en2kr" | "kr2en";
}

function QuizContent() {
  const searchParams = useSearchParams();
  const setId = searchParams.get("setId");
  const { user } = useAuth();
  const [words, setWords] = useState<Word[]>([]);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ show: boolean; isCorrect: boolean }>({ show: false, isCorrect: false });
  const [combo, setCombo] = useState(0);

  useEffect(() => {
    loadWords();
  }, [setId]);

  async function loadWords() {
    const sets = await getWordSets();
    const targetSet = sets.find((s: WordSet) => s.id === setId) || sets[0];
    if (targetSet?.words) {
      setWords(targetSet.words);
      generateQuestions(targetSet.words);
    }
    setLoading(false);
  }

  function generateQuestions(wordList: Word[]) {
    const qs: QuizQuestion[] = wordList.map((word, i) => {
      const mode: "en2kr" | "kr2en" = Math.random() > 0.5 ? "en2kr" : "kr2en";
      const otherWords = wordList.filter((_, idx) => idx !== i);
      const distractors = shuffleArray(otherWords).slice(0, 3);

      const correctAnswer = mode === "en2kr" ? word.korean : word.english;
      const options = shuffleArray([
        correctAnswer,
        ...distractors.map((d) => (mode === "en2kr" ? d.korean : d.english)),
      ]);

      return {
        word,
        options,
        correctIndex: options.indexOf(correctAnswer),
        mode,
      };
    });

    setQuestions(shuffleArray(qs));
  }

  function handleSelect(index: number) {
    if (selected !== null) return;
    setSelected(index);
    const isCorrect = index === questions[currentQ].correctIndex;
    const newResults = [...results, isCorrect];
    setResults(newResults);
    setShowResult(true);

    const newCombo = isCorrect ? combo + 1 : 0;
    setCombo(newCombo);
    setFeedback({ show: true, isCorrect });

    // 효과음 재생
    if (isCorrect) {
      playCorrectSound();
      if (newCombo >= 2) playComboSound(newCombo);
    } else {
      playWrongSound();
    }

    setTimeout(() => setFeedback((f) => ({ ...f, show: false })), 900);

    setTimeout(() => {
      if (currentQ < questions.length - 1) {
        setCurrentQ(currentQ + 1);
        setSelected(null);
        setShowResult(false);
      } else {
        finishQuiz(newResults);
      }
    }, 1200);
  }

  async function finishQuiz(finalResults: boolean[]) {
    setFinished(true);
    const records = questions.map((q, i) => ({
      wordId: q.word.id,
      moduleType: "quiz" as const,
      isCorrect: finalResults[i],
    }));
    await saveBatchLearningRecords(records, user?.id);

    const correctCount = finalResults.filter(Boolean).length;
    if (correctCount === questions.length) {
      await addReward("trophy", "4지선다 퀴즈 만점! 🏆", "quiz", user?.id);
    } else if (correctCount >= questions.length * 0.8) {
      await addReward("star", "4지선다 퀴즈 80% 이상! ⭐", "quiz", user?.id);
    }
  }

  function handleRetry() {
    setCurrentQ(0);
    setSelected(null);
    setResults([]);
    setShowResult(false);
    setFinished(false);
    generateQuestions(words);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-4xl animate-bounce-slow">❓</div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">단어가 부족합니다 (최소 4개 필요)</p>
      </div>
    );
  }

  const correctCount = results.filter(Boolean).length;
  const accuracy = Math.round((correctCount / results.length) * 100);

  if (finished) {
    return (
      <div className="min-h-screen p-4 md:p-8">
        <div className="max-w-2xl mx-auto text-center py-16">
          <div className="text-6xl mb-4">
            {accuracy === 100 ? "🏆" : accuracy >= 80 ? "🌟" : accuracy >= 60 ? "👍" : "💪"}
          </div>
          <h2 className="text-3xl font-bold text-gray-800 mb-2">퀴즈 완료!</h2>
          <div className="text-5xl font-extrabold my-6">
            <span className={accuracy >= 80 ? "text-green-600" : accuracy >= 60 ? "text-yellow-600" : "text-red-500"}>
              {correctCount}
            </span>
            <span className="text-gray-300"> / {questions.length}</span>
          </div>
          <p className="text-gray-500 mb-8">정답률 {accuracy}%</p>

          {/* Wrong answers */}
          {results.some((r) => !r) && (
            <div className="bg-white rounded-2xl p-6 shadow-md mb-8 text-left">
              <h3 className="font-bold text-red-500 mb-3">틀린 단어</h3>
              <div className="space-y-2">
                {questions.map((q, i) =>
                  !results[i] ? (
                    <div key={i} className="flex justify-between text-sm border-b pb-2">
                      <span className="font-medium">{q.word.english}</span>
                      <span className="text-gray-500">{q.word.korean}</span>
                    </div>
                  ) : null
                )}
              </div>
            </div>
          )}

          <div className="flex gap-3 justify-center">
            <button onClick={handleRetry} className="btn-kid bg-kid-blue">
              <RotateCcw className="w-5 h-5 inline mr-2" />
              다시 풀기
            </button>
            <Link href="/student" className="btn-kid bg-kid-green">
              다른 학습
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const q = questions[currentQ];
  const questionText = q.mode === "en2kr"
    ? q.word.english
    : q.word.korean;
  const questionLabel = q.mode === "en2kr"
    ? "이 영어 단어의 뜻은?"
    : "이 뜻에 맞는 영어 단어는?";

  return (
    <div className="min-h-screen p-4 md:p-8">
      <AnswerFeedback
        show={feedback.show}
        isCorrect={feedback.isCorrect}
        combo={combo}
        word={feedback.isCorrect ? questions[currentQ]?.word.english : undefined}
      />
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/student" className="p-2 hover:bg-white rounded-xl transition-colors">
              <ArrowLeft className="w-6 h-6 text-gray-600" />
            </Link>
            <h1 className="text-2xl font-bold text-gray-800">4지선다 퀴즈</h1>
          </div>
          <div className="flex items-center gap-2">
            {combo >= 2 && (
              <span className="animate-combo bg-orange-400 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                🔥 {combo}콤보
              </span>
            )}
            <span className="text-sm text-gray-500">{currentQ + 1} / {questions.length}</span>
          </div>
        </div>

        {/* Progress */}
        <div className="w-full bg-gray-200 rounded-full h-2 mb-8">
          <div
            className="bg-gradient-to-r from-purple-400 to-purple-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${((currentQ + 1) / questions.length) * 100}%` }}
          />
        </div>

        {/* Question */}
        <div className="bg-white rounded-3xl p-8 shadow-md mb-6 text-center">
          <p className="text-sm text-gray-400 mb-3">{questionLabel}</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-4">
            {questionText}
          </h2>
          {q.mode === "en2kr" && (
            <button
              onClick={() => speakEnglish(q.word.english)}
              className="p-2 bg-blue-100 rounded-full hover:bg-blue-200 transition-colors"
            >
              <Volume2 className="w-5 h-5 text-blue-600" />
            </button>
          )}
        </div>

        {/* Options */}
        <div className="grid grid-cols-1 gap-3">
          {q.options.map((option, i) => {
            let bgClass = "bg-white hover:bg-gray-50 border-2 border-gray-200";
            if (showResult && selected !== null) {
              if (i === q.correctIndex) {
                bgClass = "bg-green-100 border-2 border-green-500";
              } else if (i === selected && i !== q.correctIndex) {
                bgClass = "bg-red-100 border-2 border-red-500";
              }
            }

            const isWrong = showResult && selected === i && i !== q.correctIndex;
            const isRight = showResult && i === q.correctIndex;
            return (
              <button
                key={i}
                onClick={() => handleSelect(i)}
                disabled={selected !== null}
                className={`${bgClass} rounded-2xl p-5 text-left text-lg font-medium transition-all ${
                  selected === null ? "active:scale-[0.98]" : ""
                } ${isWrong ? "animate-shake" : ""} ${isRight && showResult ? "scale-[1.02]" : ""}`}
              >
                <span className="text-gray-400 mr-3">
                  {isRight && showResult ? "✅" : isWrong ? "❌" : `${i + 1}.`}
                </span>
                {option}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function QuizPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-4xl animate-bounce-slow">❓</div></div>}>
      <QuizContent />
    </Suspense>
  );
}
