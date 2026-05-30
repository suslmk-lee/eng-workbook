"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Volume2, RotateCcw, ArrowRight, Trophy, Award, Star } from "lucide-react";
import { Word, WordSet } from "@/lib/types";
import { getWordSets, saveBatchLearningRecords, addReward } from "@/lib/api";
import { speakEnglish, initVoices } from "@/lib/speech";
import { shuffleArray, cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import AnswerFeedback from "@/components/AnswerFeedback";

type QuestionType = "en2kr" | "kr2en" | "typing" | "listening";

interface ExamQuestion {
  word: Word;
  type: QuestionType;
  options?: string[];          // 객관식인 경우
  correctIndex?: number;        // 객관식인 경우
  correctAnswer: string;        // 정답 (영어 또는 한국어)
}

function ExamContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const setId = searchParams.get("setId");
  const [words, setWords] = useState<Word[]>([]);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState<{ word: Word; correct: boolean; type: QuestionType }[]>([]);
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ show: boolean; isCorrect: boolean }>({ show: false, isCorrect: false });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    initVoices();
    loadWords();
  }, [setId]);

  useEffect(() => {
    if (!submitted && questions[currentQ] && needsInput(questions[currentQ].type) && inputRef.current) {
      inputRef.current.focus();
    }
    // listening 문제는 자동 재생
    if (questions[currentQ]?.type === "listening" && !submitted) {
      setTimeout(() => speakEnglish(questions[currentQ].word.english, 0.8), 300);
    }
  }, [currentQ, submitted, questions]);

  async function loadWords() {
    const sets = await getWordSets();
    const targetSet = sets.find((s: WordSet) => s.id === setId) || sets[0];
    if (targetSet?.words && targetSet.words.length >= 4) {
      setWords(targetSet.words);
      setQuestions(generateQuestions(targetSet.words));
    }
    setLoading(false);
  }

  function generateQuestions(wordList: Word[]): ExamQuestion[] {
    const types: QuestionType[] = ["en2kr", "kr2en", "typing", "listening"];
    const qs: ExamQuestion[] = wordList.map((word, i) => {
      const type = types[Math.floor(Math.random() * types.length)];
      const otherWords = wordList.filter((_, idx) => idx !== i);
      const distractors = shuffleArray(otherWords).slice(0, 3);

      if (type === "en2kr") {
        const options = shuffleArray([word.korean, ...distractors.map((d) => d.korean)]);
        return {
          word,
          type,
          options,
          correctIndex: options.indexOf(word.korean),
          correctAnswer: word.korean,
        };
      }
      if (type === "kr2en") {
        const options = shuffleArray([word.english, ...distractors.map((d) => d.english)]);
        return {
          word,
          type,
          options,
          correctIndex: options.indexOf(word.english),
          correctAnswer: word.english,
        };
      }
      // typing / listening: 정답은 영어 단어
      return { word, type, correctAnswer: word.english };
    });
    return shuffleArray(qs);
  }

  function needsInput(type: QuestionType): boolean {
    return type === "typing" || type === "listening";
  }

  function handleSelectOption(index: number) {
    if (submitted) return;
    setSelected(index);
    const q = questions[currentQ];
    const correct = index === q.correctIndex;
    submitAnswer(correct);
  }

  function handleSubmitTyping(e: React.FormEvent) {
    e.preventDefault();
    if (submitted || !typedAnswer.trim()) return;
    const q = questions[currentQ];
    const correct = typedAnswer.trim().toLowerCase() === q.correctAnswer.toLowerCase();
    submitAnswer(correct);
  }

  function submitAnswer(correct: boolean) {
    setSubmitted(true);
    const q = questions[currentQ];
    setResults((prev) => [...prev, { word: q.word, correct, type: q.type }]);
    setFeedback({ show: true, isCorrect: correct });
    setTimeout(() => setFeedback((f) => ({ ...f, show: false })), 900);
  }

  function handleNext() {
    if (currentQ < questions.length - 1) {
      setCurrentQ(currentQ + 1);
      setSelected(null);
      setTypedAnswer("");
      setSubmitted(false);
    } else {
      finishExam();
    }
  }

  async function finishExam() {
    setFinished(true);
    const records = results.map((r) => ({
      wordId: r.word.id,
      moduleType: "exam" as const,
      isCorrect: r.correct,
    }));
    if (records.length > 0) {
      await saveBatchLearningRecords(records, user?.id);
    }

    const correctCount = results.filter((r) => r.correct).length;
    const accuracy = Math.round((correctCount / results.length) * 100);

    if (accuracy === 100) {
      await addReward("crown", `🎓 오늘의 시험 만점! 완벽해요!`, "exam", user?.id);
    } else if (accuracy >= 90) {
      await addReward("trophy", `🎓 오늘의 시험 ${accuracy}점! 우수!`, "exam", user?.id);
    } else if (accuracy >= 70) {
      await addReward("star", `🎓 오늘의 시험 ${accuracy}점! 합격!`, "exam", user?.id);
    }
  }

  function handleRetry() {
    setCurrentQ(0);
    setSelected(null);
    setTypedAnswer("");
    setSubmitted(false);
    setResults([]);
    setFinished(false);
    setQuestions(generateQuestions(words));
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-4xl animate-bounce-slow">📝</div>
      </div>
    );
  }

  if (words.length < 4) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">시험을 보려면 단어가 최소 4개 필요합니다</p>
          <Link href="/student" className="btn-primary">돌아가기</Link>
        </div>
      </div>
    );
  }

  if (finished) {
    const correctCount = results.filter((r) => r.correct).length;
    const accuracy = Math.round((correctCount / results.length) * 100);
    const grade =
      accuracy === 100 ? { label: "완벽!", emoji: "👑", color: "text-yellow-500" }
      : accuracy >= 90 ? { label: "우수", emoji: "🏆", color: "text-yellow-500" }
      : accuracy >= 70 ? { label: "합격", emoji: "⭐", color: "text-blue-500" }
      : accuracy >= 50 ? { label: "노력 필요", emoji: "💪", color: "text-orange-500" }
      : { label: "재도전!", emoji: "📖", color: "text-red-500" };

    return (
      <div className="min-h-screen p-4 md:p-8">
        <div className="max-w-2xl mx-auto text-center py-8">
          <div className="text-7xl mb-4">{grade.emoji}</div>
          <h2 className="text-3xl font-bold text-gray-800 mb-1">시험 결과</h2>
          <p className={cn("text-xl font-bold mb-4", grade.color)}>{grade.label}</p>

          <div className="bg-white rounded-3xl p-6 shadow-md mb-6">
            <div className="text-6xl font-extrabold mb-2">
              <span className={accuracy >= 90 ? "text-yellow-500" : accuracy >= 70 ? "text-blue-500" : "text-orange-500"}>
                {correctCount}
              </span>
              <span className="text-gray-300"> / {results.length}</span>
            </div>
            <p className="text-gray-500">정답률 {accuracy}%</p>
          </div>

          {results.some((r) => !r.correct) && (
            <div className="bg-white rounded-2xl p-6 shadow-md mb-6 text-left">
              <h3 className="font-bold text-red-500 mb-3">📌 틀린 단어 다시 보기</h3>
              <div className="space-y-2">
                {results.map((r, i) =>
                  !r.correct ? (
                    <div key={i} className="flex justify-between text-sm py-2 border-b last:border-0">
                      <span className="font-medium text-gray-800">{r.word.english}</span>
                      <span className="text-gray-500">{r.word.korean}</span>
                    </div>
                  ) : null
                )}
              </div>
            </div>
          )}

          <div className="flex gap-3 justify-center">
            <button onClick={handleRetry} className="btn-kid bg-kid-blue">
              <RotateCcw className="w-5 h-5 inline mr-2" />
              다시 보기
            </button>
            <Link href="/student" className="btn-kid bg-kid-green">
              메인으로
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const q = questions[currentQ];
  if (!q) return null;
  const progress = ((currentQ + 1) / questions.length) * 100;

  return (
    <div className="min-h-screen p-4 md:p-8">
      <AnswerFeedback
        show={feedback.show}
        isCorrect={feedback.isCorrect}
        word={feedback.isCorrect ? q.word.english : undefined}
      />
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/student" className="p-2 hover:bg-white rounded-xl transition-colors">
              <ArrowLeft className="w-6 h-6 text-gray-600" />
            </Link>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <Award className="w-6 h-6 text-yellow-500" /> 오늘의 시험
            </h1>
          </div>
          <span className="text-sm text-gray-500 font-medium">
            {currentQ + 1} / {questions.length}
          </span>
        </div>

        {/* Progress */}
        <div className="w-full bg-gray-200 rounded-full h-2 mb-8">
          <div
            className="bg-gradient-to-r from-yellow-400 via-orange-400 to-red-400 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Question Type Badge */}
        <div className="flex justify-center mb-4">
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-yellow-100 text-yellow-700">
            {q.type === "en2kr" && "📖 영어 → 한국어 (객관식)"}
            {q.type === "kr2en" && "✍️ 한국어 → 영어 (객관식)"}
            {q.type === "typing" && "⌨️ 한국어 → 영어 (직접 입력)"}
            {q.type === "listening" && "🎧 듣고 영어 쓰기"}
          </span>
        </div>

        {/* Question Display */}
        <div className="bg-white rounded-3xl p-8 shadow-md mb-6 text-center">
          {q.type === "en2kr" && (
            <>
              <p className="text-sm text-gray-400 mb-2">이 단어의 뜻은?</p>
              <h2 className="text-4xl font-bold text-gray-800 mb-3">{q.word.english}</h2>
              <button
                onClick={() => speakEnglish(q.word.english)}
                className="p-2 bg-blue-100 rounded-full hover:bg-blue-200 transition-colors"
              >
                <Volume2 className="w-5 h-5 text-blue-600" />
              </button>
            </>
          )}
          {(q.type === "kr2en" || q.type === "typing") && (
            <>
              <p className="text-sm text-gray-400 mb-2">이 뜻에 맞는 영어 단어는?</p>
              <h2 className="text-3xl font-bold text-gray-800">{q.word.korean}</h2>
            </>
          )}
          {q.type === "listening" && (
            <>
              <p className="text-sm text-gray-400 mb-4">발음을 듣고 영어 단어를 써보세요</p>
              <button
                onClick={() => speakEnglish(q.word.english, 0.8)}
                className="p-5 bg-yellow-100 rounded-full hover:bg-yellow-200 transition-all hover:scale-105 mx-auto"
              >
                <Volume2 className="w-9 h-9 text-yellow-600" />
              </button>
              {submitted && (
                <p className="text-sm text-gray-500 mt-3">
                  뜻: <span className="font-bold">{q.word.korean}</span>
                </p>
              )}
            </>
          )}
        </div>

        {/* Answer Area */}
        {(q.type === "en2kr" || q.type === "kr2en") && q.options && (
          <div className="grid grid-cols-1 gap-3">
            {q.options.map((opt, i) => {
              let bg = "bg-white hover:bg-gray-50 border-2 border-gray-200";
              if (submitted && selected !== null) {
                if (i === q.correctIndex) bg = "bg-green-100 border-2 border-green-500";
                else if (i === selected) bg = "bg-red-100 border-2 border-red-500";
              }
              return (
                <button
                  key={i}
                  onClick={() => handleSelectOption(i)}
                  disabled={submitted}
                  className={cn(
                    bg,
                    "rounded-2xl p-5 text-left text-lg font-medium transition-all",
                    !submitted && "active:scale-[0.98]"
                  )}
                >
                  <span className="text-gray-400 mr-3">
                    {submitted && i === q.correctIndex ? "✅" :
                     submitted && i === selected ? "❌" : `${i + 1}.`}
                  </span>
                  {opt}
                </button>
              );
            })}
          </div>
        )}

        {(q.type === "typing" || q.type === "listening") && (
          <form onSubmit={handleSubmitTyping}>
            <input
              ref={inputRef}
              type="text"
              value={typedAnswer}
              onChange={(e) => setTypedAnswer(e.target.value)}
              disabled={submitted}
              placeholder="영어 단어를 입력하세요"
              className={cn(
                "input-field text-center text-2xl font-bold py-5 mb-4",
                submitted && results[results.length - 1]?.correct && "border-green-500 bg-green-50 text-green-700",
                submitted && !results[results.length - 1]?.correct && "border-red-500 bg-red-50 text-red-700"
              )}
              autoComplete="off"
              spellCheck={false}
            />
            {!submitted ? (
              <button type="submit" className="btn-primary w-full" disabled={!typedAnswer.trim()}>
                제출
              </button>
            ) : null}
          </form>
        )}

        {/* Result + Next */}
        {submitted && (
          <div className="mt-4">
            {results[results.length - 1]?.correct ? (
              <div className="text-center py-3 bg-green-50 rounded-xl mb-4">
                <p className="text-green-600 font-bold text-lg">정답! 🎉</p>
              </div>
            ) : (
              <div className="text-center py-3 bg-red-50 rounded-xl mb-4">
                <p className="text-red-500 font-bold">오답</p>
                <p className="text-red-400 text-sm mt-1">
                  정답: <span className="font-bold text-red-600">{q.correctAnswer}</span>
                </p>
              </div>
            )}
            <button
              onClick={handleNext}
              className="btn-kid bg-kid-blue w-full flex items-center justify-center gap-2"
            >
              {currentQ < questions.length - 1 ? (
                <>다음 문제 <ArrowRight className="w-5 h-5" /></>
              ) : (
                "결과 보기"
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ExamPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-4xl animate-bounce-slow">📝</div></div>}>
      <ExamContent />
    </Suspense>
  );
}
