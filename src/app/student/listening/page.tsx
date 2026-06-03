"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Volume2, RotateCcw, ArrowRight } from "lucide-react";
import { Word, WordSet } from "@/lib/types";
import { getWordSets, saveLearningRecord, addReward } from "@/lib/api";
import { speakEnglish, initVoices } from "@/lib/speech";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useKeyboardOpen } from "@/lib/use-keyboard-open";
import AnswerFeedback from "@/components/AnswerFeedback";
import { playCorrectSound, playWrongSound, playComboSound } from "@/lib/sound";

function ListeningContent() {
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
  const [feedback, setFeedback] = useState<{ show: boolean; isCorrect: boolean }>({ show: false, isCorrect: false });
  const [combo, setCombo] = useState(0);
  const [playCount, setPlayCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const keyboardOpen = useKeyboardOpen();

  useEffect(() => {
    initVoices();
    loadWords();
  }, [setId]);

  // 키보드가 열리면 재생 버튼+입력란이 키보드 위에 보이도록 맨 위로 스크롤
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

  function handlePlay(rate?: number) {
    if (words.length > 0) {
      speakEnglish(words[currentIndex].english, rate || 0.8);
      setPlayCount((c) => c + 1);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || submitted) return;

    const currentWord = words[currentIndex];
    const correct = input.trim().toLowerCase() === currentWord.english.toLowerCase();
    setIsCorrect(correct);
    setSubmitted(true);
    setResults([...results, { word: currentWord, correct }]);
    saveLearningRecord(currentWord.id, "listening", correct, undefined, user?.id);
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
  }

  function handleNext() {
    if (currentIndex < words.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setInput("");
      setSubmitted(false);
      setIsCorrect(false);
      setPlayCount(0);
    } else {
      finishExercise();
    }
  }

  async function finishExercise() {
    setFinished(true);
    const correctCount = results.filter((r) => r.correct).length;
    if (correctCount === words.length) {
      await addReward("trophy", "듣고 쓰기 만점! 🏆", "listening", user?.id);
    } else if (correctCount >= words.length * 0.8) {
      await addReward("star", "듣고 쓰기 80% 이상! ⭐", "listening", user?.id);
    }
  }

  function handleRetry() {
    setCurrentIndex(0);
    setInput("");
    setSubmitted(false);
    setIsCorrect(false);
    setResults([]);
    setFinished(false);
    setPlayCount(0);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-4xl animate-bounce-slow">🎧</div>
      </div>
    );
  }

  if (finished) {
    const correctCount = results.filter((r) => r.correct).length;
    const accuracy = Math.round((correctCount / results.length) * 100);
    return (
      <div className="min-h-screen p-4 md:p-8">
        <div className="max-w-2xl mx-auto text-center py-12">
          <div className="text-6xl mb-4">{accuracy === 100 ? "🏆" : accuracy >= 80 ? "🌟" : "💪"}</div>
          <h2 className="text-3xl font-bold text-gray-800 mb-2">듣고 쓰기 완료!</h2>
          <div className="text-5xl font-extrabold my-6">
            <span className={accuracy >= 80 ? "text-green-600" : "text-orange-500"}>{correctCount}</span>
            <span className="text-gray-300"> / {results.length}</span>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-md mb-8 text-left">
            {results.map((r, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                <span className={r.correct ? "text-green-600" : "text-red-500"}>{r.correct ? "✓" : "✗"}</span>
                <span className="font-medium">{r.word.english}</span>
                <span className="text-gray-400">{r.word.korean}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-3 justify-center">
            <button onClick={handleRetry} className="btn-kid bg-kid-blue">
              <RotateCcw className="w-5 h-5 inline mr-2" />다시하기
            </button>
            <Link href="/student" className="btn-kid bg-kid-green">다른 학습</Link>
          </div>
        </div>
      </div>
    );
  }

  if (words.length === 0) return null;

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
        <div className={cn("flex items-center justify-between", keyboardOpen ? "mb-2" : "mb-6")}>
          <div className="flex items-center gap-3">
            <Link href="/student" className="p-2 hover:bg-white rounded-xl transition-colors">
              <ArrowLeft className="w-6 h-6 text-gray-600" />
            </Link>
            <h1 className={cn("font-bold text-gray-800", keyboardOpen ? "text-lg" : "text-2xl")}>듣고 쓰기</h1>
          </div>
          <div className="text-sm text-gray-500">{currentIndex + 1} / {words.length}</div>
        </div>

        <div className={cn("w-full bg-gray-200 rounded-full h-2", keyboardOpen ? "mb-3" : "mb-8")}>
          <div className="bg-gradient-to-r from-yellow-400 to-yellow-600 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>

        {/* Listen Button */}
        <div className={cn("bg-white shadow-md text-center", keyboardOpen ? "rounded-2xl p-3 mb-3" : "rounded-3xl p-8 mb-6")}>
          {!keyboardOpen && <p className="text-sm text-gray-400 mb-4">발음을 듣고 영어 단어를 써보세요</p>}
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => handlePlay(0.8)}
              className={cn("bg-yellow-100 rounded-full hover:bg-yellow-200 transition-all hover:scale-105", keyboardOpen ? "p-3" : "p-6")}
            >
              <Volume2 className={cn("text-yellow-600", keyboardOpen ? "w-7 h-7" : "w-10 h-10")} />
            </button>
            <button
              onClick={() => handlePlay(0.5)}
              className={cn("bg-orange-100 rounded-full hover:bg-orange-200 transition-all self-end", keyboardOpen ? "p-2" : "p-4")}
            >
              <Volume2 className="w-6 h-6 text-orange-600" />
              <span className="text-xs text-orange-500 block">느리게</span>
            </button>
          </div>
          {!keyboardOpen && <p className="text-xs text-gray-300 mt-3">재생 횟수: {playCount}</p>}
          {submitted && (
            <p className="text-sm text-gray-500 mt-2">한국어 뜻: <span className="font-bold">{currentWord.korean}</span></p>
          )}
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={submitted}
            placeholder="들은 단어를 입력하세요"
            className={cn(
              "input-field text-center font-bold",
              keyboardOpen ? "text-xl py-3 mb-2" : "text-2xl py-5 mb-4",
              submitted && isCorrect && "border-green-500 bg-green-50 text-green-700",
              submitted && !isCorrect && "border-red-500 bg-red-50 text-red-700"
            )}
            autoComplete="off"
            spellCheck={false}
          />

          {!submitted ? (
            <button type="submit" className="btn-primary w-full" disabled={!input.trim()}>
              확인
            </button>
          ) : (
            <div>
              {isCorrect ? (
                <div className="text-center py-3 bg-green-50 rounded-xl mb-4">
                  <p className="text-green-600 font-bold text-lg">정답! 🎉</p>
                </div>
              ) : (
                <div className="text-center py-3 bg-red-50 rounded-xl mb-4">
                  <p className="text-red-500 font-bold">오답!</p>
                  <p className="text-red-400 text-sm">정답: <span className="font-bold text-red-600">{currentWord.english}</span></p>
                </div>
              )}
              <button onClick={handleNext} className="btn-kid bg-kid-blue w-full flex items-center justify-center gap-2">
                {currentIndex < words.length - 1 ? (<>다음 <ArrowRight className="w-5 h-5" /></>) : "결과 보기"}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

export default function ListeningPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-4xl animate-bounce-slow">🎧</div></div>}>
      <ListeningContent />
    </Suspense>
  );
}
