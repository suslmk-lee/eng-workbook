"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useActiveChild } from "@/lib/child-mode";
import { saveLearningRecord } from "@/lib/api";
import { blankSentence, SentenceItem } from "@/lib/sentence";
import { shuffleArray } from "@/lib/utils";
import { speakEnglish } from "@/lib/speech";
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

const TITLE = "문장 빈칸 채우기";

function ClozeContent() {
  const setId = useSearchParams().get("setId");
  const child = useActiveChild();
  const { loading, words, items, regenerate } = useSentenceItems(child.id, setId);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [results, setResults] = useState<{ item: SentenceItem; correct: boolean }[]>([]);
  const [done, setDone] = useState(false);

  // 문제마다 보기 4개: 정답 + 세트의 다른 단어 3개
  const options = useMemo(
    () =>
      items.map((item) => {
        const others = Array.from(new Set(words.map((w) => w.english))).filter((e) => e !== item.word.english);
        return shuffleArray([item.word.english, ...shuffleArray(others).slice(0, 3)]);
      }),
    [items, words]
  );

  if (loading) return <SentenceLoading />;
  if (items.length < MIN_SENTENCES) return <SentenceEmpty title={TITLE} />;
  if (done) {
    return (
      <SentenceResult
        title={TITLE}
        results={results}
        onRetry={() => {
          regenerate();
          setIndex(0);
          setPicked(null);
          setResults([]);
          setDone(false);
        }}
      />
    );
  }

  const item = items[index];
  const answered = picked !== null;
  const shownToken = item.tokens[item.targetIndex].toLowerCase().replace(/[^a-z]/g, "");
  const changedForm = shownToken !== item.word.english.toLowerCase();

  function choose(option: string) {
    if (answered) return;
    const ok = option === item.word.english;
    setPicked(option);
    if (ok) playCorrectSound();
    else playWrongSound();
    speakEnglish(item.sentence, 0.85);
    setResults((r) => [...r, { item, correct: ok }]);
    saveLearningRecord(item.word.id, "cloze", ok, undefined, child.id);
  }

  async function next() {
    if (index + 1 >= items.length) {
      setDone(true);
      await rewardSentenceSession("cloze", TITLE, results.filter((r) => r.correct).length, results.length, child.id);
      return;
    }
    setIndex(index + 1);
    setPicked(null);
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <SentenceHeader title={TITLE} index={index} total={items.length} />

        <div className="bg-white rounded-3xl shadow-md p-6 md:p-8 text-center mb-4">
          <p className="text-sm text-gray-400 mb-3">빈칸에 들어갈 단어를 골라요</p>
          <p className="text-2xl md:text-3xl font-bold text-gray-800 leading-relaxed mb-3">
            {answered ? item.sentence : blankSentence(item)}
          </p>
          <p className="text-gray-500">{item.translation}</p>
          {changedForm && !answered && (
            <p className="text-xs text-amber-600 mt-2">힌트: 문장 안에서는 단어 모양이 조금 바뀌어 들어가요</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {options[index].map((opt) => {
            const isAnswer = opt === item.word.english;
            const style = !answered
              ? "bg-white shadow-sm hover:shadow-md text-gray-800"
              : isAnswer
                ? "bg-green-100 border-2 border-green-500 text-green-700"
                : opt === picked
                  ? "bg-red-100 border-2 border-red-400 text-red-600"
                  : "bg-gray-50 text-gray-400";
            return (
              <button
                key={opt}
                onClick={() => choose(opt)}
                disabled={answered}
                className={`p-4 rounded-2xl text-xl font-bold transition-all ${style}`}
              >
                {opt}
              </button>
            );
          })}
        </div>

        {answered && (
          <>
            <SentenceAnswer item={item} correct={picked === item.word.english} />
            <button onClick={next} className="btn-kid bg-kid-blue w-full mt-4">
              {index + 1 >= items.length ? "결과 보기" : "다음 문제"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function ClozePage() {
  return (
    <Suspense fallback={<SentenceLoading />}>
      <ClozeContent />
    </Suspense>
  );
}
