"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Volume2, Mic, RotateCcw, Check, X, ArrowRight } from "lucide-react";
import { Word, WordSet } from "@/lib/types";
import { getWordSets, saveLearningRecord, addReward } from "@/lib/api";
import { speakEnglish } from "@/lib/speech";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import AnswerFeedback from "@/components/AnswerFeedback";
import { playCorrectSound, playWrongSound, playComboSound } from "@/lib/sound";

const MAX_ATTEMPTS = 3;

// ===== 발음 비교 =====

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

// 인식된 후보들 중 목표 단어와 가장 가까운 결과 평가
function judge(target: string, transcripts: string[]): { pass: boolean; heard: string } {
  const t = normalize(target);
  let best = { sim: 0, heard: transcripts[0] ?? "" };
  for (const raw of transcripts) {
    const h = normalize(raw);
    if (h === t) return { pass: true, heard: raw };
    const sim = similarity(t, h);
    if (sim > best.sim) best = { sim, heard: raw };
  }
  return { pass: best.sim >= 0.8, heard: best.heard };
}

function getRecognition(): any | null {
  if (typeof window === "undefined") return null;
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  return SR ? new SR() : null;
}

function SpeakingContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const setId = searchParams.get("setId");
  const [words, setWords] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [judged, setJudged] = useState<"pass" | "retry" | "fail" | null>(null);
  const [results, setResults] = useState<{ word: Word; correct: boolean }[]>([]);
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [supported, setSupported] = useState(true);
  const [micError, setMicError] = useState("");
  const [feedback, setFeedback] = useState<{ show: boolean; isCorrect: boolean }>({ show: false, isCorrect: false });
  const [combo, setCombo] = useState(0);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (!getRecognition()) setSupported(false);
    loadWords();
    return () => {
      recognitionRef.current?.abort?.();
    };
  }, [setId]);

  async function loadWords() {
    const sets = await getWordSets();
    const targetSet = sets.find((s: WordSet) => s.id === setId) || sets[0];
    if (targetSet?.words) {
      setWords(targetSet.words);
    }
    setLoading(false);
  }

  function startListening() {
    if (listening || judged === "pass" || judged === "fail") return;
    const recognition = getRecognition();
    if (!recognition) return;
    recognitionRef.current = recognition;

    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 5;

    setMicError("");
    setHeard(null);
    setListening(true);

    recognition.onresult = (event: any) => {
      const alternatives: string[] = [];
      const result = event.results[0];
      for (let i = 0; i < result.length; i++) alternatives.push(result[i].transcript);
      handleResult(alternatives);
    };
    recognition.onerror = (event: any) => {
      setListening(false);
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setMicError("마이크 사용을 허용해주세요 (브라우저 설정)");
      } else if (event.error === "no-speech") {
        setMicError("소리가 들리지 않았어요. 다시 눌러서 크게 말해보세요!");
      } else {
        setMicError("음성 인식에 실패했어요. 다시 시도해주세요.");
      }
    };
    recognition.onend = () => setListening(false);

    try {
      recognition.start();
    } catch {
      setListening(false);
    }
  }

  function handleResult(transcripts: string[]) {
    const currentWord = words[currentIndex];
    const { pass, heard: heardText } = judge(currentWord.english, transcripts);
    const attemptNo = attempts + 1;
    setAttempts(attemptNo);
    setHeard(heardText);
    setListening(false);

    if (pass) {
      setJudged("pass");
      setResults((r) => [...r, { word: currentWord, correct: true }]);
      saveLearningRecord(currentWord.id, "speaking", true, undefined, user?.id);
      const newCombo = combo + 1;
      setCombo(newCombo);
      setFeedback({ show: true, isCorrect: true });
      playCorrectSound();
      if (newCombo >= 2) playComboSound(newCombo);
      setTimeout(() => setFeedback((f) => ({ ...f, show: false })), 900);
    } else if (attemptNo >= MAX_ATTEMPTS) {
      setJudged("fail");
      setResults((r) => [...r, { word: currentWord, correct: false }]);
      saveLearningRecord(currentWord.id, "speaking", false, undefined, user?.id);
      setCombo(0);
      setFeedback({ show: true, isCorrect: false });
      playWrongSound();
      speakEnglish(currentWord.english);
      setTimeout(() => setFeedback((f) => ({ ...f, show: false })), 900);
    } else {
      setJudged("retry");
    }
  }

  function handleNext() {
    if (currentIndex < words.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setAttempts(0);
      setHeard(null);
      setJudged(null);
      setMicError("");
    } else {
      finishExercise();
    }
  }

  async function finishExercise() {
    setFinished(true);
    const correctCount = results.filter((r) => r.correct).length;
    if (correctCount === words.length) {
      await addReward("trophy", "발음 챌린지 만점! 🏆", "speaking", user?.id);
    } else if (correctCount >= words.length * 0.8) {
      await addReward("star", "발음 챌린지 80% 이상! ⭐", "speaking", user?.id);
    }
  }

  function handleRetry() {
    setCurrentIndex(0);
    setAttempts(0);
    setHeard(null);
    setJudged(null);
    setResults([]);
    setFinished(false);
    setMicError("");
    setCombo(0);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-4xl animate-bounce-slow">🎤</div>
      </div>
    );
  }

  if (!supported) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">😢</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">음성 인식을 지원하지 않아요</h2>
          <p className="text-gray-500 mb-6">
            이 기기/브라우저에서는 발음 챌린지를 할 수 없어요.<br />
            크롬이나 사파리 최신 버전에서 시도해보세요.
          </p>
          <Link href="/student" className="btn-primary inline-block">다른 학습 하러 가기</Link>
        </div>
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
          <div className="text-6xl mb-4">{accuracy === 100 ? "🏆" : accuracy >= 80 ? "🌟" : "💪"}</div>
          <h2 className="text-3xl font-bold text-gray-800 mb-2">발음 챌린지 완료!</h2>
          <div className="text-5xl font-extrabold my-6">
            <span className={accuracy >= 80 ? "text-green-600" : "text-orange-500"}>{correctCount}</span>
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
              <RotateCcw className="w-5 h-5 inline mr-2" />다시하기
            </button>
            <Link href="/student" className="btn-kid bg-kid-green">다른 학습</Link>
          </div>
        </div>
      </div>
    );
  }

  const currentWord = words[currentIndex];
  const progress = ((currentIndex + 1) / words.length) * 100;
  const done = judged === "pass" || judged === "fail";

  return (
    <div className="min-h-screen p-4 md:p-8">
      <AnswerFeedback
        show={feedback.show}
        isCorrect={feedback.isCorrect}
        combo={combo}
        word={feedback.isCorrect ? currentWord.english : undefined}
      />
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/student" className="p-2 hover:bg-white rounded-xl transition-colors">
              <ArrowLeft className="w-6 h-6 text-gray-600" />
            </Link>
            <h1 className="text-2xl font-bold text-gray-800">발음 챌린지</h1>
          </div>
          <div className="flex items-center gap-2">
            {combo >= 2 && (
              <span className="animate-combo bg-indigo-400 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                🔥 {combo}콤보
              </span>
            )}
            <span className="text-sm text-gray-500">{currentIndex + 1} / {words.length}</span>
          </div>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-2 mb-8">
          <div
            className="bg-gradient-to-r from-indigo-400 to-indigo-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Word Card */}
        <div className="bg-white rounded-3xl p-8 shadow-md mb-6 text-center">
          <p className="text-sm text-gray-400 mb-2">이 단어를 마이크에 대고 읽어보세요</p>
          <h2 className="text-4xl font-extrabold text-gray-800 mb-1">{currentWord.english}</h2>
          <p className="text-gray-500 mb-4">{currentWord.korean}</p>
          <button
            onClick={() => speakEnglish(currentWord.english)}
            className="p-3 bg-blue-100 rounded-full hover:bg-blue-200 transition-colors"
            title="발음 듣기"
          >
            <Volume2 className="w-6 h-6 text-blue-600" />
          </button>
        </div>

        {/* Mic */}
        <div className="text-center mb-6">
          <button
            onClick={startListening}
            disabled={listening || done}
            className={cn(
              "w-28 h-28 rounded-full flex items-center justify-center mx-auto shadow-lg transition-all",
              listening
                ? "bg-red-500 animate-pulse scale-110"
                : done
                  ? "bg-gray-200"
                  : "bg-indigo-500 hover:bg-indigo-600 hover:scale-105 active:scale-95"
            )}
          >
            <Mic className={cn("w-12 h-12", listening || !done ? "text-white" : "text-gray-400")} />
          </button>
          <p className="text-sm text-gray-500 mt-3 font-medium">
            {listening
              ? "듣고 있어요... 크게 말해보세요!"
              : done
                ? ""
                : `마이크를 누르고 말해보세요 (${MAX_ATTEMPTS - attempts}번 남음)`}
          </p>
          {micError && <p className="text-sm text-red-500 mt-2">{micError}</p>}
        </div>

        {/* Result */}
        {heard !== null && (
          <div
            className={cn(
              "rounded-2xl p-4 text-center mb-4",
              judged === "pass" && "bg-green-50",
              judged === "retry" && "bg-yellow-50",
              judged === "fail" && "bg-red-50"
            )}
          >
            <p className="text-sm text-gray-500">
              이렇게 들렸어요: <span className="font-bold text-gray-700">&ldquo;{heard}&rdquo;</span>
            </p>
            {judged === "pass" && <p className="text-green-600 font-bold text-lg mt-1">완벽한 발음이에요! 🎉</p>}
            {judged === "retry" && (
              <p className="text-yellow-700 font-bold mt-1">
                조금 아쉬워요! 발음을 다시 듣고 따라해보세요 💪
              </p>
            )}
            {judged === "fail" && (
              <p className="text-red-500 font-bold mt-1">
                괜찮아요! 정답 발음을 잘 들어두세요
              </p>
            )}
          </div>
        )}

        {done && (
          <button
            onClick={handleNext}
            className="btn-kid bg-kid-blue w-full flex items-center justify-center gap-2"
          >
            {currentIndex < words.length - 1 ? (
              <>다음 <ArrowRight className="w-5 h-5" /></>
            ) : (
              "결과 보기"
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export default function SpeakingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-4xl animate-bounce-slow">🎤</div></div>}>
      <SpeakingContent />
    </Suspense>
  );
}
