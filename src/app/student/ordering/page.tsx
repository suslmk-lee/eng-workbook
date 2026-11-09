"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useActiveChild } from "@/lib/child-mode";
import { saveLearningRecord } from "@/lib/api";
import { SentenceItem } from "@/lib/sentence";
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

const TITLE = "문장 순서 맞추기";
// 너무 짧거나 긴 문장은 제외 (3~9단어)
const fits = (item: SentenceItem) => item.tokens.length >= 3 && item.tokens.length <= 9;

function OrderingContent() {
  const setId = useSearchParams().get("setId");
  const child = useActiveChild();
  const { loading, items, regenerate } = useSentenceItems(child.id, setId, fits);
  const [index, setIndex] = useState(0);
  const [placed, setPlaced] = useState<number[]>([]);  // 고른 단어 조각(원래 문장에서의 위치)
  const [checked, setChecked] = useState<boolean | null>(null);
  const [results, setResults] = useState<{ item: SentenceItem; correct: boolean }[]>([]);
  const [done, setDone] = useState(false);

  // 문제마다 섞인 조각 순서 (원래 순서와 다르게)
  const bankOrders = useMemo(
    () =>
      items.map((item) => {
        const idx = item.tokens.map((_, i) => i);
        let shuffled = shuffleArray(idx);
        for (let k = 0; k < 5 && shuffled.every((v, i) => v === i); k++) shuffled = shuffleArray(idx);
        return shuffled;
      }),
    [items]
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
          setPlaced([]);
          setChecked(null);
          setResults([]);
          setDone(false);
        }}
      />
    );
  }

  const item = items[index];
  const bank = bankOrders[index];
  const allPlaced = placed.length === item.tokens.length;

  function place(tokenIndex: number) {
    if (checked !== null || placed.includes(tokenIndex)) return;
    setPlaced((p) => [...p, tokenIndex]);
  }

  function unplace(position: number) {
    if (checked !== null) return;
    setPlaced((p) => p.filter((_, i) => i !== position));
  }

  function check() {
    // 같은 단어가 두 번 나오는 문장도 있으니 위치가 아니라 글자로 비교
    const ok = placed.map((i) => item.tokens[i]).join(" ") === item.tokens.join(" ");
    setChecked(ok);
    if (ok) playCorrectSound();
    else playWrongSound();
    speakEnglish(item.sentence, 0.85);
    setResults((r) => [...r, { item, correct: ok }]);
    saveLearningRecord(item.word.id, "ordering", ok, undefined, child.id);
  }

  async function next() {
    if (index + 1 >= items.length) {
      setDone(true);
      await rewardSentenceSession("ordering", TITLE, results.filter((r) => r.correct).length, results.length, child.id);
      return;
    }
    setIndex(index + 1);
    setPlaced([]);
    setChecked(null);
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <SentenceHeader title={TITLE} index={index} total={items.length} />

        <div className="bg-white rounded-3xl shadow-md p-6 text-center mb-4">
          <p className="text-sm text-gray-400 mb-2">뜻에 맞게 단어를 순서대로 눌러요</p>
          <p className="text-xl font-bold text-gray-800">{item.translation}</p>
        </div>

        {/* 만든 문장 */}
        <div
          className={`min-h-[72px] rounded-2xl border-2 border-dashed p-3 flex flex-wrap gap-2 items-center mb-4 ${
            checked === null ? "border-gray-300 bg-white/60" : checked ? "border-green-400 bg-green-50" : "border-red-300 bg-red-50"
          }`}
          aria-label="만든 문장"
        >
          {placed.length === 0 && <span className="text-gray-400 text-sm">여기에 문장이 만들어져요</span>}
          {placed.map((tokenIndex, pos) => (
            <button
              key={`${tokenIndex}-${pos}`}
              onClick={() => unplace(pos)}
              disabled={checked !== null}
              className="px-3 py-2 rounded-xl bg-primary-500 text-white text-lg font-medium"
            >
              {item.tokens[tokenIndex]}
            </button>
          ))}
        </div>

        {/* 남은 조각 */}
        <div className="flex flex-wrap gap-2 justify-center mb-4" aria-label="단어 조각">
          {bank.map((tokenIndex) => (
            <button
              key={tokenIndex}
              onClick={() => place(tokenIndex)}
              disabled={placed.includes(tokenIndex) || checked !== null}
              className={`px-3 py-2 rounded-xl text-lg font-medium shadow-sm ${
                placed.includes(tokenIndex) ? "bg-gray-100 text-gray-300" : "bg-white text-gray-800 hover:shadow-md"
              }`}
            >
              {item.tokens[tokenIndex]}
            </button>
          ))}
        </div>

        {checked === null ? (
          <button onClick={check} disabled={!allPlaced} className="btn-kid bg-kid-blue w-full disabled:opacity-40">
            확인
          </button>
        ) : (
          <>
            <SentenceAnswer item={item} correct={checked} />
            <button onClick={next} className="btn-kid bg-kid-blue w-full mt-4">
              {index + 1 >= items.length ? "결과 보기" : "다음 문제"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function OrderingPage() {
  return (
    <Suspense fallback={<SentenceLoading />}>
      <OrderingContent />
    </Suspense>
  );
}
