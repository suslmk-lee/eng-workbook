"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, RotateCcw, Check, ArrowRight } from "lucide-react";
import { Word, WordSet } from "@/lib/types";
import { getWordSets, saveLearningRecord, addReward } from "@/lib/api";
import { scrambleWord, cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import AnswerFeedback from "@/components/AnswerFeedback";
import { playCorrectSound, playWrongSound, playComboSound } from "@/lib/sound";

function ScrambleContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const setId = searchParams.get("setId");
  const [words, setWords] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [scrambled, setScrambled] = useState<string[]>([]);
  const [answer, setAnswer] = useState<string[]>([]);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [results, setResults] = useState<{ word: Word; correct: boolean }[]>([]);
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ show: boolean; isCorrect: boolean }>({ show: false, isCorrect: false });
  const [combo, setCombo] = useState(0);

  useEffect(() => {
    loadWords();
  }, [setId]);

  useEffect(() => {
    if (words.length > 0 && currentIndex < words.length) {
      setScrambled(scrambleWord(words[currentIndex].english));
      setAnswer([]);
      setIsCorrect(null);
    }
  }, [currentIndex, words]);

  async function loadWords() {
    const sets = await getWordSets();
    const targetSet = sets.find((s: WordSet) => s.id === setId) || sets[0];
    if (targetSet?.words) {
      setWords(targetSet.words);
    }
    setLoading(false);
  }

  function handleLetterClick(letter: string, index: number) {
    if (isCorrect !== null) return;
    const newScrambled = [...scrambled];
    newScrambled.splice(index, 1);
    setScrambled(newScrambled);
    const newAnswer = [...answer, letter];
    setAnswer(newAnswer);

    if (newAnswer.length === words[currentIndex].english.length) {
      const correct = newAnswer.join("") === words[currentIndex].english;
      setIsCorrect(correct);
      setResults([...results, { word: words[currentIndex], correct }]);
      saveLearningRecord(words[currentIndex].id, "scramble", correct, undefined, user?.id);
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
  }

  function handleAnswerClick(index: number) {
    if (isCorrect !== null) return;
    const letter = answer[index];
    const newAnswer = [...answer];
    newAnswer.splice(index, 1);
    setAnswer(newAnswer);
    setScrambled([...scrambled, letter]);
  }

  function handleNext() {
    if (currentIndex < words.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      finishGame();
    }
  }

  async function finishGame() {
    setFinished(true);
    const correctCount = results.filter((r) => r.correct).length;
    if (correctCount === words.length) {
      await addReward("trophy", "스크램블 만점! 🏆", "scramble", user?.id);
    } else if (correctCount >= words.length * 0.8) {
      await addReward("star", "스크램블 80% 이상! ⭐", "scramble", user?.id);
    }
  }

  function handleRetry() {
    setCurrentIndex(0);
    setResults([]);
    setFinished(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-4xl animate-bounce-slow">🔀</div>
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
          <h2 className="text-3xl font-bold text-gray-800 mb-2">스크램블 완료!</h2>
          <div className="text-5xl font-extrabold my-6">
            <span className={accuracy >= 80 ? "text-green-600" : "text-orange-500"}>{correctCount}</span>
            <span className="text-gray-300"> / {results.length}</span>
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
    <div className="min-h-screen p-4 md:p-8">
      <AnswerFeedback
        show={feedback.show}
        isCorrect={feedback.isCorrect}
        combo={combo}
        word={feedback.isCorrect ? currentWord.english : undefined}
      />
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-3 md:mb-6">
          <div className="flex items-center gap-3">
            <Link href="/student" className="p-2 hover:bg-white rounded-xl transition-colors">
              <ArrowLeft className="w-6 h-6 text-gray-600" />
            </Link>
            <h1 className="text-xl md:text-2xl font-bold text-gray-800">단어 스크램블</h1>
          </div>
          <div className="flex items-center gap-2">
            {combo >= 2 && (
              <span className="animate-combo bg-pink-400 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                🔥 {combo}콤보
              </span>
            )}
            <span className="text-sm text-gray-500">{currentIndex + 1} / {words.length}</span>
          </div>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-2 mb-4 md:mb-8">
          <div className="bg-gradient-to-r from-pink-400 to-pink-600 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>

        <div className="bg-white rounded-3xl p-4 md:p-8 shadow-md mb-4 md:mb-6 text-center">
          <p className="text-sm text-gray-400 mb-2">이 뜻에 맞는 영어 단어를 맞춰보세요</p>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-800">{currentWord.korean}</h2>
        </div>

        {/* Answer Area */}
        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-md mb-4 md:mb-6">
          <div className="flex flex-wrap gap-2 justify-center min-h-[60px] items-center">
            {answer.length === 0 && (
              <p className="text-gray-300">글자를 클릭하세요</p>
            )}
            {answer.map((letter, i) => (
              <button
                key={`ans-${i}`}
                onClick={() => handleAnswerClick(i)}
                className={cn(
                  "w-12 h-12 rounded-xl font-bold text-xl flex items-center justify-center transition-all",
                  isCorrect === null && "bg-primary-100 text-primary-700 hover:bg-primary-200",
                  isCorrect === true && "bg-green-100 text-green-700",
                  isCorrect === false && "bg-red-100 text-red-700"
                )}
              >
                {letter}
              </button>
            ))}
          </div>
        </div>

        {/* Scrambled Letters */}
        <div className="flex flex-wrap gap-2 justify-center mb-4 md:mb-8">
          {scrambled.map((letter, i) => (
            <button
              key={`scr-${i}`}
              onClick={() => handleLetterClick(letter, i)}
              className="w-12 h-12 bg-gray-100 rounded-xl font-bold text-xl text-gray-700 hover:bg-gray-200 hover:scale-105 transition-all flex items-center justify-center shadow-sm"
            >
              {letter}
            </button>
          ))}
        </div>

        {/* Result & Next */}
        {isCorrect !== null && (
          <div className="text-center">
            {isCorrect ? (
              <div className="py-3 bg-green-50 rounded-xl mb-4">
                <p className="text-green-600 font-bold text-lg">정답! 🎉</p>
              </div>
            ) : (
              <div className="py-3 bg-red-50 rounded-xl mb-4">
                <p className="text-red-500 font-bold">오답!</p>
                <p className="text-red-400 text-sm">정답: <span className="font-bold">{currentWord.english}</span></p>
              </div>
            )}
            <button onClick={handleNext} className="btn-kid bg-kid-blue flex items-center justify-center gap-2 mx-auto">
              {currentIndex < words.length - 1 ? (<>다음 <ArrowRight className="w-5 h-5" /></>) : "결과 보기"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ScramblePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-4xl animate-bounce-slow">🔀</div></div>}>
      <ScrambleContent />
    </Suspense>
  );
}
