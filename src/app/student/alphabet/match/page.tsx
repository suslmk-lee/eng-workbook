"use client";

import { useEffect, useState } from "react";
import { useActiveChild } from "@/lib/child-mode";
import { letterSpeech, pickLetters } from "@/lib/alphabet";
import { recordAlphabetResult } from "@/lib/api";
import { speakEnglish } from "@/lib/speech";
import { playCorrectSound, playWrongSound } from "@/lib/sound";
import { shuffleArray } from "@/lib/utils";
import { AlphabetHeader, AlphabetLoading, AlphabetResult, rewardAlphabet, useAlphabetProgress } from "@/components/AlphabetKit";

const TITLE = "대소문자 짝 맞추기";
const PAIRS = 6;

// 큰 글자(왼쪽)와 작은 글자(오른쪽)를 짝짓기. 한 번에 맞힌 글자만 정답으로 기록
export default function AlphabetMatch() {
  const child = useActiveChild();
  const { progress, reload } = useAlphabetProgress(child.id);
  const [upper, setUpper] = useState<string[] | null>(null);
  const [lower, setLower] = useState<string[]>([]);
  const [selUpper, setSelUpper] = useState<string | null>(null);
  const [selLower, setSelLower] = useState<string | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [missed, setMissed] = useState<Set<string>>(new Set()); // 한 번이라도 잘못 짝지은 큰 글자
  const [wrongPair, setWrongPair] = useState<[string, string] | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (progress && !upper) {
      const letters = pickLetters(progress, PAIRS).map((l) => l.letter);
      setUpper(shuffleArray(letters));
      setLower(shuffleArray(letters));
    }
  }, [progress, upper]);

  // 양쪽을 하나씩 고르면 맞는지 확인
  useEffect(() => {
    if (!selUpper || !selLower) return;
    if (selUpper === selLower) {
      const letter = selUpper;
      playCorrectSound();
      speakEnglish(letterSpeech(letter));
      const next = new Set(matched).add(letter);
      setMatched(next);
      void recordAlphabetResult(child.id, letter, !missed.has(letter));
      setSelUpper(null);
      setSelLower(null);
      if (next.size === PAIRS) {
        setDone(true);
        void rewardAlphabet(TITLE, PAIRS - missed.size, PAIRS, child.id);
      }
    } else {
      playWrongSound();
      setMissed((m) => new Set(m).add(selUpper));
      setWrongPair([selUpper, selLower]);
      const t = setTimeout(() => {
        setWrongPair(null);
        setSelUpper(null);
        setSelLower(null);
      }, 600);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selUpper, selLower]);

  if (!upper) return <AlphabetLoading />;

  function retry() {
    reload();
    setUpper(null);
    setMatched(new Set());
    setMissed(new Set());
    setSelUpper(null);
    setSelLower(null);
    setDone(false);
  }

  const tile = (letter: string, side: "upper" | "lower") => {
    const isMatched = matched.has(letter);
    const selected = side === "upper" ? selUpper === letter : selLower === letter;
    const wrong = wrongPair && (side === "upper" ? wrongPair[0] === letter : wrongPair[1] === letter);
    return (
      <button
        key={`${side}-${letter}`}
        data-side={side}
        data-letter={letter}
        disabled={isMatched || !!wrongPair}
        onClick={() => (side === "upper" ? setSelUpper(letter) : setSelLower(letter))}
        className={`w-full h-20 rounded-2xl border-2 text-5xl font-extrabold shadow-sm transition-all active:scale-95 ${
          isMatched
            ? "bg-green-100 border-green-300 text-green-600 opacity-60"
            : wrong
              ? "bg-red-100 border-red-300 animate-shake"
              : selected
                ? "bg-yellow-100 border-yellow-400 text-gray-900"
                : "bg-white border-gray-200 text-gray-800"
        }`}
      >
        {side === "upper" ? letter : letter.toLowerCase()}
      </button>
    );
  };

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <AlphabetHeader title={TITLE} index={matched.size} total={PAIRS} />
        {done ? (
          <AlphabetResult title={TITLE} correct={PAIRS - missed.size} total={PAIRS} onRetry={retry} />
        ) : (
          <>
            <p className="text-center text-gray-500 mb-4">큰 글자와 같은 작은 글자를 하나씩 눌러요</p>
            <div className="grid grid-cols-2 gap-6">
              <div className="flex flex-col gap-3" aria-label="큰 글자">
                {upper.map((l) => tile(l, "upper"))}
              </div>
              <div className="flex flex-col gap-3" aria-label="작은 글자">
                {lower.map((l) => tile(l, "lower"))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
