"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Mic, Volume2 } from "lucide-react";
import { useActiveChild } from "@/lib/child-mode";
import { saveLearningRecord } from "@/lib/api";
import { SentenceItem, spokenMatchRatio, SPOKEN_PASS_RATIO } from "@/lib/sentence";
import { speakEnglish, createSpeechRecognition, speechRecognitionErrorMessage } from "@/lib/speech";
import { playCorrectSound, playWrongSound } from "@/lib/sound";
import {
  useSentenceItems,
  SentenceHeader,
  SentenceLoading,
  SentenceEmpty,
  SentenceAnswer,
  SentenceResult,
  rewardSentenceSession,
  MIN_SENTENCES,
} from "@/components/SentenceModule";

const TITLE = "문장 따라 말하기";
const MAX_ATTEMPTS = 3;

function ShadowingContent() {
  const setId = useSearchParams().get("setId");
  const child = useActiveChild();
  const { loading, items, regenerate } = useSentenceItems(child.id, setId);
  const [index, setIndex] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [judged, setJudged] = useState<"pass" | "retry" | "fail" | null>(null);
  const [micError, setMicError] = useState("");
  const [supported, setSupported] = useState(true);
  const [results, setResults] = useState<{ item: SentenceItem; correct: boolean }[]>([]);
  const [done, setDone] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (!createSpeechRecognition()) setSupported(false);
    return () => recognitionRef.current?.abort?.();
  }, []);

  if (loading) return <SentenceLoading />;
  if (items.length < MIN_SENTENCES) return <SentenceEmpty title={TITLE} />;
  if (!supported) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-md p-8 max-w-md text-center">
          <div className="text-5xl mb-4">🎤</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">{TITLE}</h2>
          <p className="text-gray-500 mb-6">
            이 브라우저에서는 음성 인식을 쓸 수 없어요.
            <br />
            크롬이나 사파리에서 해 주세요.
          </p>
          <Link href="/student" className="btn-kid bg-kid-blue inline-block">
            돌아가기
          </Link>
        </div>
      </div>
    );
  }
  if (done) {
    return (
      <SentenceResult
        title={TITLE}
        results={results}
        onRetry={() => {
          regenerate();
          setIndex(0);
          setAttempts(0);
          setHeard(null);
          setJudged(null);
          setResults([]);
          setDone(false);
        }}
      />
    );
  }

  const item = items[index];
  const finished = judged === "pass" || judged === "fail";

  function record(ok: boolean) {
    setResults((r) => [...r, { item, correct: ok }]);
    saveLearningRecord(item.word.id, "shadowing", ok, undefined, child.id);
  }

  function handleSpeech(alternatives: string[]) {
    let best = { ratio: 0, text: alternatives[0] ?? "" };
    for (const text of alternatives) {
      const ratio = spokenMatchRatio(item.sentence, text);
      if (ratio > best.ratio) best = { ratio, text };
    }
    setHeard(best.text);
    const tries = attempts + 1;
    setAttempts(tries);
    if (best.ratio >= SPOKEN_PASS_RATIO) {
      setJudged("pass");
      playCorrectSound();
      record(true);
    } else if (tries >= MAX_ATTEMPTS) {
      setJudged("fail");
      playWrongSound();
      record(false);
    } else {
      setJudged("retry");
      playWrongSound();
    }
  }

  function startListening() {
    if (listening || finished) return;
    const recognition = createSpeechRecognition();
    if (!recognition) return;
    recognitionRef.current = recognition;
    setMicError("");
    setListening(true);
    recognition.onresult = (event: any) => {
      const result = event.results[0];
      const alternatives: string[] = [];
      for (let i = 0; i < result.length; i++) alternatives.push(result[i].transcript);
      handleSpeech(alternatives);
    };
    recognition.onerror = (event: any) => {
      setListening(false);
      setMicError(speechRecognitionErrorMessage(event.error));
    };
    recognition.onend = () => setListening(false);
    try {
      recognition.start();
    } catch {
      setListening(false);
    }
  }

  async function next() {
    if (index + 1 >= items.length) {
      setDone(true);
      await rewardSentenceSession("shadowing", TITLE, results.filter((r) => r.correct).length, results.length, child.id);
      return;
    }
    setIndex(index + 1);
    setAttempts(0);
    setHeard(null);
    setJudged(null);
    setMicError("");
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <SentenceHeader title={TITLE} index={index} total={items.length} />

        <div className="bg-white rounded-3xl shadow-md p-6 md:p-8 text-center mb-4">
          <p className="text-sm text-gray-400 mb-3">듣고 따라 말해요</p>
          <p className="text-2xl md:text-3xl font-bold text-gray-800 leading-relaxed mb-2">{item.sentence}</p>
          <p className="text-gray-500 mb-4">{item.translation}</p>
          <button
            onClick={() => speakEnglish(item.sentence, 0.8)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-full font-medium hover:bg-blue-200"
          >
            <Volume2 className="w-5 h-5" /> 듣기
          </button>
        </div>

        {!finished && (
          <div className="text-center">
            <button
              onClick={startListening}
              disabled={listening}
              className={`w-24 h-24 rounded-full inline-flex items-center justify-center shadow-lg transition-all ${
                listening ? "bg-red-500 animate-pulse" : "bg-primary-500 hover:scale-105"
              }`}
              aria-label="말하기"
            >
              <Mic className="w-10 h-10 text-white" />
            </button>
            <p className="text-sm text-gray-500 mt-3">
              {listening ? "듣고 있어요… 문장을 말해요" : `마이크를 누르고 말해요 (${attempts}/${MAX_ATTEMPTS})`}
            </p>
            {micError && <p className="text-sm text-red-500 mt-2">{micError}</p>}
            {judged === "retry" && heard && (
              <p className="text-sm text-orange-500 mt-2">
                &quot;{heard}&quot;(으)로 들렸어요. 한 번 더 말해 볼까요?
              </p>
            )}
          </div>
        )}

        {finished && (
          <>
            {heard && <p className="text-sm text-gray-500 text-center">들린 문장: &quot;{heard}&quot;</p>}
            <SentenceAnswer item={item} correct={judged === "pass"} />
            <button onClick={next} className="btn-kid bg-kid-blue w-full mt-4">
              {index + 1 >= items.length ? "결과 보기" : "다음 문장"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function ShadowingPage() {
  return (
    <Suspense fallback={<SentenceLoading />}>
      <ShadowingContent />
    </Suspense>
  );
}
