"use client";

import { useEffect, useState } from "react";
import { Volume2 } from "lucide-react";
import { useActiveChild } from "@/lib/child-mode";
import { distractors, LetterInfo, pickLetters } from "@/lib/alphabet";
import { recordAlphabetResult } from "@/lib/api";
import { speakEnglish } from "@/lib/speech";
import { playCorrectSound, playWrongSound } from "@/lib/sound";
import { shuffleArray } from "@/lib/utils";
import { AlphabetHeader, AlphabetLoading, AlphabetResult, rewardAlphabet, useAlphabetProgress } from "@/components/AlphabetKit";

const TITLE = "첫 글자 찾기";
const COUNT = 8;

interface Question {
  info: LetterInfo;
  options: string[];
}

// 그림 단어를 듣고 어떤 글자로 시작하는지 고르기 (X는 단어 끝 글자라 빼고)
export default function AlphabetFirstLetter() {
  const child = useActiveChild();
  const { progress, reload } = useAlphabetProgress(child.id);
  const [round, setRound] = useState<Question[] | null>(null);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (progress && !round) {
      setRound(
        pickLetters(progress, COUNT, (l) => l.firstLetter).map((info) => ({
          info,
          options: shuffleArray([info.letter, ...distractors(info.letter)]),
        }))
      );
    }
  }, [progress, round]);

  const q = round?.[index];
  useEffect(() => {
    if (q && !done) speakEnglish(q.info.word);
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

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <AlphabetHeader title={TITLE} index={done ? round.length : index} total={round.length} />
        {done ? (
          <AlphabetResult title={TITLE} correct={correctCount} total={round.length} onRetry={retry} />
        ) : (
          <>
            <div className="bg-white rounded-3xl shadow-md p-6 text-center mb-6">
              <p className="text-sm text-gray-500">이 단어는 어떤 글자로 시작할까요?</p>
              <div className="text-8xl my-3" aria-hidden>
                {q.info.emoji}
              </div>
              {picked ? (
                <p className="text-3xl font-bold text-gray-800" aria-label="단어">
                  <span className="text-orange-500">{q.info.word[0]}</span>
                  {q.info.word.slice(1)} <span className="text-base text-gray-500">({q.info.korean})</span>
                </p>
              ) : (
                <p className="text-gray-500">{q.info.korean}</p>
              )}
              <button
                onClick={() => speakEnglish(q.info.word)}
                className="mt-3 inline-flex items-center gap-2 px-5 py-2 rounded-full bg-blue-50 text-blue-600 font-bold"
                aria-label="단어 듣기"
              >
                <Volume2 className="w-5 h-5" />
                단어 듣기
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
                    className={`h-24 rounded-3xl border-2 border-gray-200 bg-white text-5xl font-extrabold text-gray-800 shadow-sm active:scale-95 transition-all ${state}`}
                  >
                    {o}
                    <span className="text-3xl opacity-60">{o.toLowerCase()}</span>
                  </button>
                );
              })}
            </div>
            {picked && (
              <div className="mt-6 text-center">
                <p className={`text-xl font-extrabold ${picked === q.info.letter ? "text-green-600" : "text-red-500"}`}>
                  {picked === q.info.letter ? "정답이에요! 🎉" : `아쉬워요! ${q.info.word}는 ${q.info.letter}로 시작해요`}
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
