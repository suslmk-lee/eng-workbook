"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Volume2, ChevronLeft, ChevronRight, RotateCcw, Check } from "lucide-react";
import { Word, WordSet } from "@/lib/types";
import { getWordSets, saveBatchLearningRecords, addReward } from "@/lib/api";
import { speakEnglish } from "@/lib/speech";
import { useAuth } from "@/lib/auth-context";

function FlashcardContent() {
  const searchParams = useSearchParams();
  const setId = searchParams.get("setId");
  const { user } = useAuth();
  const [words, setWords] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [learned, setLearned] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [rewarded, setRewarded] = useState(false);

  const allLearned = words.length > 0 && learned.size === words.length;

  useEffect(() => {
    loadWords();
  }, [setId]);

  useEffect(() => {
    if (allLearned && !rewarded) {
      setRewarded(true);
      const records = words.map((w) => ({
        wordId: w.id,
        moduleType: "flashcard" as const,
        isCorrect: true,
      }));
      saveBatchLearningRecords(records, user?.id);
      addReward("trophy", "플래시카드 완주! 모든 단어를 외웠어요 🎉", "flashcard", user?.id);
    }
  }, [allLearned]);

  async function loadWords() {
    const sets = await getWordSets();
    const targetSet = sets.find((s: WordSet) => s.id === setId) || sets[0];
    if (targetSet?.words) {
      setWords(targetSet.words);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-4xl animate-bounce-slow">📇</div>
      </div>
    );
  }

  if (words.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">단어가 없습니다</p>
          <Link href="/student" className="btn-primary">돌아가기</Link>
        </div>
      </div>
    );
  }

  const currentWord = words[currentIndex];
  const progress = ((currentIndex + 1) / words.length) * 100;

  function handleNext() {
    setIsFlipped(false);
    setTimeout(() => {
      if (currentIndex < words.length - 1) {
        setCurrentIndex(currentIndex + 1);
      }
    }, 150);
  }

  function handlePrev() {
    setIsFlipped(false);
    setTimeout(() => {
      if (currentIndex > 0) {
        setCurrentIndex(currentIndex - 1);
      }
    }, 150);
  }

  function handleLearn() {
    const newLearned = new Set(learned);
    newLearned.add(currentWord.id);
    setLearned(newLearned);
    handleNext();
  }

  function handleReset() {
    setCurrentIndex(0);
    setIsFlipped(false);
    setLearned(new Set());
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/student" className="p-2 hover:bg-white rounded-xl transition-colors">
              <ArrowLeft className="w-6 h-6 text-gray-600" />
            </Link>
            <h1 className="text-2xl font-bold text-gray-800">플래시카드</h1>
          </div>
          <div className="text-sm text-gray-500">
            {currentIndex + 1} / {words.length}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-2 mb-8">
          <div
            className="bg-gradient-to-r from-blue-400 to-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Learned Counter */}
        <div className="text-center mb-4">
          <span className="badge bg-green-100 text-green-700">
            외운 단어: {learned.size} / {words.length}
          </span>
        </div>

        {allLearned ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">모두 외웠어요!</h2>
            <p className="text-gray-500 mb-6">정말 잘했어요! 다른 학습도 해볼까요?</p>
            <div className="flex gap-3 justify-center">
              <button onClick={handleReset} className="btn-kid bg-kid-blue">
                <RotateCcw className="w-5 h-5 inline mr-2" />
                다시하기
              </button>
              <Link href="/student" className="btn-kid bg-kid-green">
                다른 학습
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Card */}
            <div
              className="perspective cursor-pointer mb-8"
              onClick={() => setIsFlipped(!isFlipped)}
            >
              <div
                className={`relative w-full h-64 md:h-80 transition-transform duration-500 preserve-3d ${
                  isFlipped ? "rotate-y-180" : ""
                }`}
              >
                {/* Front - English */}
                <div className="absolute inset-0 backface-hidden bg-white rounded-3xl shadow-lg flex flex-col items-center justify-center p-8">
                  <p className="text-sm text-gray-400 mb-2">영어</p>
                  <h2 className="text-4xl md:text-5xl font-bold text-gray-800 mb-4">
                    {currentWord.english}
                  </h2>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      speakEnglish(currentWord.english);
                    }}
                    className="p-3 bg-blue-100 rounded-full hover:bg-blue-200 transition-colors"
                  >
                    <Volume2 className="w-6 h-6 text-blue-600" />
                  </button>
                  <p className="text-xs text-gray-300 mt-4">탭하여 뜻 확인</p>
                </div>

                {/* Back - Korean */}
                <div className="absolute inset-0 backface-hidden rotate-y-180 bg-gradient-to-br from-primary-500 to-primary-700 rounded-3xl shadow-lg flex flex-col items-center justify-center p-8">
                  <p className="text-sm text-blue-200 mb-2">한국어</p>
                  <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                    {currentWord.korean}
                  </h2>
                  <p className="text-lg text-blue-100">{currentWord.english}</p>
                  <p className="text-xs text-blue-200 mt-4">탭하여 영어 보기</p>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={handlePrev}
                disabled={currentIndex === 0}
                className="p-3 bg-white rounded-full shadow-md hover:shadow-lg disabled:opacity-30 transition-all"
              >
                <ChevronLeft className="w-6 h-6 text-gray-600" />
              </button>

              <button
                onClick={handleLearn}
                className="btn-kid bg-kid-green flex items-center gap-2"
              >
                <Check className="w-5 h-5" />
                외웠어요!
              </button>

              <button
                onClick={handleNext}
                disabled={currentIndex === words.length - 1}
                className="p-3 bg-white rounded-full shadow-md hover:shadow-lg disabled:opacity-30 transition-all"
              >
                <ChevronRight className="w-6 h-6 text-gray-600" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function FlashcardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-4xl animate-bounce-slow">📇</div></div>}>
      <FlashcardContent />
    </Suspense>
  );
}
