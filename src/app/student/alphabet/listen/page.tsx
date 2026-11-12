"use client";

import { useEffect, useState } from "react";
import { Volume2 } from "lucide-react";
import { useActiveChild } from "@/lib/child-mode";
import { distractors, letterSpeech, LetterInfo, pickLetters } from "@/lib/alphabet";
import { recordAlphabetResult } from "@/lib/api";
import { speakEnglish } from "@/lib/speech";
import { playCorrectSound, playWrongSound } from "@/lib/sound";
import { shuffleArray } from "@/lib/utils";
import { AlphabetHeader, AlphabetLoading, AlphabetResult, rewardAlphabet, useAlphabetProgress } from "@/components/AlphabetKit";

const TITLE = "듣고 고르기";
const COUNT = 8;

interface Question {
  info: LetterInfo;
  lower: boolean;     // 보기를 소문자로 보여줄지 (대문자·소문자 섞어서 연습)
  options: string[];  // 대문자
}

function buildRound(progress: Parameters<typeof pickLetters>[0]): Question[] {
  return pickLetters(progress, COUNT).map((info) => ({
    info,
    lower: Math.random() < 0.5,
    options: shuffleArray([info.letter, ...distractors(info.letter)]),
  }));
}

// 글자 이름을 듣고 4개 중에서 맞는 글자 고르기
export default function AlphabetListen() {
  const child = useActiveChild();
  const { progress, reload } = useAlphabetProgress(child.id);
  const [round, setRound] = useState<Question[] | null>(null);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (progress && !round) setRound(buildRound(progress));
  }, [progress, round]);

  const q = round?.[index];
  // 문제가 바뀌면 글자 이름을 들려준다
  useEffect(() => {
    if (q && !done) speakEnglish(letterSpeech(q.info.letter));
  }, [q, done]);

  if (!round || !q) return <AlphabetLoading />;

  function pick(option: string) {
    if (picked || !q) return;
    const ok = option === q.info.letter;
    setPicked(option);
    if (ok) {
      playCorrectSound();
      setCorrectCount((c) => c + 1);
    } else {
      playWrongSound();
    }
    void recordAlphabetResult(child.id, q.info.letter, ok);
  }

  function next() {
    if (!round) return;
    if (index + 1 >= round.length) {
      setDone(true);
      void rewardAlphabet(TITLE, correctCount, round.length, child.id);
      return;
    }
    setIndex(index + 1);
    setPicked(null);
  }

  function retry() {
    reload();
    setRound(null);
    setIndex(0);
    setPicked(null);
    setCorrectCount(0);
    setDone(false);
  }

  const show = (l: string) => (q.lower ? l.toLowerCase() : l);

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <AlphabetHeader title={TITLE} index={done ? round.length : index} total={round.length} />
        {done ? (
          <AlphabetResult title={TITLE} correct={correctCount} total={round.length} onRetry={retry} />
        ) : (
          <>
            <div className="bg-white rounded-3xl shadow-md p-6 text-center mb-6">
              <p className="text-sm text-gray-500 mb-3">글자 이름을 듣고 맞는 글자를 골라요</p>
              <button
                onClick={() => speakEnglish(letterSpeech(q.info.letter))}
                className="inline-flex items-center gap-2 px-6 py-4 rounded-full bg-blue-500 text-white text-lg font-bold shadow-md active:scale-95"
                aria-label="다시 듣기"
              >
                <Volume2 className="w-7 h-7" />
                다시 듣기
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3" aria-label="보기">
              {q.options.map((o) => {
                const isAnswer = o === q.info.letter;
                const state = !picked ? "" : isAnswer ? "bg-green-100 border-green-400" : o === picked ? "bg-red-100 border-red-300 animate-shake" : "opacity-50";
                return (
                  <button
                    key={o}
                    onClick={() => pick(o)}
                    disabled={!!picked}
                    data-letter={o}
                    className={`h-28 rounded-3xl border-2 border-gray-200 bg-white text-6xl font-extrabold text-gray-800 shadow-sm active:scale-95 transition-all ${state}`}
                  >
                    {show(o)}
                  </button>
                );
              })}
            </div>
            {picked && (
              <div className="mt-6 text-center">
                <p className={`text-xl font-extrabold ${picked === q.info.letter ? "text-green-600" : "text-red-500"}`}>
                  {picked === q.info.letter ? "정답이에요! 🎉" : `아쉬워요! 정답은 ${show(q.info.letter)}`}
                </p>
                <button onClick={next} className="btn-kid bg-kid-blue mt-4">
                  {index + 1 >= round.length ? "결과 보기" : "다음 문제"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
