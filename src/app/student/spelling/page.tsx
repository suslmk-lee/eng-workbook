"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Volume2, RotateCcw, Check, X, ArrowRight } from "lucide-react";
import { Word, WordSet } from "@/lib/types";
import { getWordSets, saveLearningRecord, addReward } from "@/lib/api";
import { speakEnglish } from "@/lib/speech";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useKeyboardOpen } from "@/lib/use-keyboard-open";
import AnswerFeedback from "@/components/AnswerFeedback";
import { playCorrectSound, playWrongSound, playComboSound } from "@/lib/sound";

function SpellingContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const setId = searchParams.get("setId");
  const [words, setWords] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [input, setInput] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [results, setResults] = useState<{ word: Word; correct: boolean }[]>([]);
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showHint, setShowHint] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState<{ show: boolean; isCorrect: boolean }>({ show: false, isCorrect: false });
  const [combo, setCombo] = useState(0);
  const keyboardOpen = useKeyboardOpen();

  useEffect(() => {
    loadWords();
  }, [setId]);

  // 키보드가 열리면 문제+입력란이 키보드 위에 보이도록 맨 위로 스크롤
  useEffect(() => {
    if (!keyboardOpen) return;
    const tid = setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 250);
    return () => clearTimeout(tid);
  }, [keyboardOpen]);

  useEffect(() => {
    if (!submitted && inputRef.current) {
      inputRef.current.focus();
    }
  }, [currentIndex, submitted]);

  async function loadWords() {
    const sets = await getWordSets();
    const targetSet = sets.find((s: WordSet) => s.id === setId) || sets[0];
    if (targetSet?.words) {
      setWords(targetSet.words);
    }
    setLoading(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || submitted) return;

    const currentWord = words[currentIndex];
    const correct = input.trim().toLowerCase() === currentWord.english.toLowerCase();
    setIsCorrect(correct);
    setSubmitted(true);
    setResults([...results, { word: currentWord, correct }]);

    saveLearningRecord(currentWord.id, "spelling", correct, undefined, user?.id);

    const newCombo = correct ? combo + 1 : 0;
    setCombo(newCombo);
    setFeedback({ show: true, isCorrect: correct });

    // 효과음 재생
    if (correct) {
      playCorrectSound();
      if (newCombo >= 2) playComboSound(newCombo);
    } else {
      playWrongSound();
    }

    setTimeout(() => setFeedback((f) => ({ ...f, show: false })), 900);

    if (!correct) {
      speakEnglish(currentWord.english);
    }
  }

  function handleNext() {
    if (currentIndex < words.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setInput("");
      setSubmitted(false);
      setIsCorrect(false);
      setShowHint(false);
    } else {
      finishExercise();
    }
  }

  async function finishExercise() {
    setFinished(true);
    const correctCount = results.filter((r) => r.correct).length;
    if (correctCount === words.length) {
      await addReward("trophy", "스펠링 입력 만점! 🏆", "spelling", user?.id);
    } else if (correctCount >= words.length * 0.8) {
      await addReward("star", "스펠링 입력 80% 이상! ⭐", "spelling", user?.id);
    }
  }

  function handleRetry() {
    setCurrentIndex(0);
    setInput("");
    setSubmitted(false);
    setIsCorrect(false);
    setResults([]);
    setFinished(false);
    setShowHint(false);
  }

  function getHint(word: string): string {
    const chars = word.split("");
    return chars.map((c, i) => (i === 0 || i === chars.length - 1 ? c : "_")).join(" ");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-4xl animate-bounce-slow">✏️</div>
      </div>
    );
  }

  if (words.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">단어가 없습니다</p>
      </div>
    );
  }

  if (finished) {
    const correctCount = results.filter((r) => r.correct).length;
    const accuracy = Math.round((correctCount / results.length) * 100);
    return (
      <div className="min-h-screen p-4 md:p-8">
        <div className="max-w-2xl mx-auto text-center py-12">
          <div className="text-6xl mb-4">
            {accuracy === 100 ? "🏆" : accuracy >= 80 ? "🌟" : "💪"}
          </div>
          <h2 className="text-3xl font-bold text-gray-800 mb-2">스펠링 완료!</h2>
          <div className="text-5xl font-extrabold my-6">
            <span className={accuracy >= 80 ? "text-green-600" : "text-orange-500"}>
              {correctCount}
            </span>
            <span className="text-gray-300"> / {results.length}</span>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-md mb-8 text-left">
            <h3 className="font-bold mb-3">결과</h3>
            {results.map((r, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex items-center gap-2">
                  {r.correct ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <X className="w-4 h-4 text-red-500" />
                  )}
                  <span className="font-medium">{r.word.english}</span>
                </div>
                <span className="text-gray-500 text-sm">{r.word.korean}</span>
              </div>
            ))}
          </div>

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
      </div>
    );
  }

  const currentWord = words[currentIndex];
  const progress = ((currentIndex + 1) / words.length) * 100;

  return (
    <div className={cn("min-h-screen", keyboardOpen ? "p-2" : "p-4 md:p-8")}>
      <AnswerFeedback
        show={feedback.show}
        isCorrect={feedback.isCorrect}
        combo={combo}
        word={feedback.isCorrect ? currentWord.english : undefined}
      />
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className={cn("flex items-center justify-between", keyboardOpen ? "mb-2" : "mb-6")}>
          <div className="flex items-center gap-3">
            <Link href="/student" className="p-2 hover:bg-white rounded-xl transition-colors">
              <ArrowLeft className="w-6 h-6 text-gray-600" />
            </Link>
            <h1 className={cn("font-bold text-gray-800", keyboardOpen ? "text-lg" : "text-2xl")}>스펠링 입력</h1>
          </div>
          <div className="flex items-center gap-2">
            {combo >= 2 && (
              <span className="animate-combo bg-orange-400 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                🔥 {combo}콤보
              </span>
            )}
            <span className="text-sm text-gray-500">{currentIndex + 1} / {words.length}</span>
          </div>
        </div>

        <div className={cn("w-full bg-gray-200 rounded-full h-2", keyboardOpen ? "mb-3" : "mb-8")}>
          <div
            className="bg-gradient-to-r from-orange-400 to-orange-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Question */}
        <div className={cn("bg-white shadow-md text-center", keyboardOpen ? "rounded-2xl p-3 mb-3" : "rounded-3xl p-8 mb-6")}>
          {!keyboardOpen && <p className="text-sm text-gray-400 mb-2">이 뜻에 맞는 영어 단어를 써보세요</p>}
          <h2 className={cn("font-bold text-gray-800", keyboardOpen ? "text-2xl mb-1" : "text-3xl mb-4")}>{currentWord.korean}</h2>

          {showHint && !submitted && (
            <p className={cn("text-lg text-gray-400 font-mono tracking-widest", keyboardOpen ? "mb-1" : "mb-4")}>
              {getHint(currentWord.english)}
            </p>
          )}

          {!showHint && !submitted && (
            <button
              onClick={() => setShowHint(true)}
              className={cn("text-sm text-primary-500 hover:text-primary-700", keyboardOpen ? "mb-0" : "mb-4")}
            >
              힌트 보기
            </button>
          )}
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className={keyboardOpen ? "mb-2" : "mb-6"}>
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={submitted}
              placeholder="영어 단어를 입력하세요"
              className={cn(
                "input-field text-center font-bold",
                keyboardOpen ? "text-xl py-3" : "text-2xl py-5",
                submitted && isCorrect && "border-green-500 bg-green-50 text-green-700",
                submitted && !isCorrect && "border-red-500 bg-red-50 text-red-700"
              )}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {!submitted ? (
            <button type="submit" className={cn("btn-primary w-full", keyboardOpen ? "mt-2" : "mt-4")} disabled={!input.trim()}>
              확인
            </button>
          ) : (
            <div className="mt-4">
              {isCorrect ? (
                <div className="text-center py-3 bg-green-50 rounded-xl">
                  <p className="text-green-600 font-bold text-lg">정답! 🎉</p>
                </div>
              ) : (
                <div className="text-center py-3 bg-red-50 rounded-xl">
                  <p className="text-red-500 font-bold text-lg">오답!</p>
                  <p className="text-red-400 mt-1">
                    정답: <span className="font-bold text-red-600">{currentWord.english}</span>
                  </p>
                </div>
              )}
              <button
                onClick={handleNext}
                className="btn-kid bg-kid-blue w-full mt-4 flex items-center justify-center gap-2"
              >
                {currentIndex < words.length - 1 ? (
                  <>
                    다음 <ArrowRight className="w-5 h-5" />
                  </>
                ) : (
                  "결과 보기"
                )}
              </button>
            </div>
          )}
        </form>

        {submitted && (
          <div className="text-center">
            <button
              onClick={() => speakEnglish(currentWord.english)}
              className="p-3 bg-blue-100 rounded-full hover:bg-blue-200 transition-colors"
            >
              <Volume2 className="w-6 h-6 text-blue-600" />
            </button>
            <p className="text-xs text-gray-400 mt-1">발음 듣기</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SpellingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-4xl animate-bounce-slow">✏️</div></div>}>
      <SpellingContent />
    </Suspense>
  );
}
