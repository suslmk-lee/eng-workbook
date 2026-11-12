"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Volume2, X } from "lucide-react";
import { useActiveChild } from "@/lib/child-mode";
import { LETTERS, letterSpeech } from "@/lib/alphabet";
import { speakEnglish } from "@/lib/speech";
import { AlphabetLoading, masteredCount, useAlphabetProgress } from "@/components/AlphabetKit";

const ACTIVITIES = [
  { href: "/student/alphabet/listen", emoji: "👂", title: "듣고 고르기", desc: "글자 이름을 듣고 맞는 글자를 골라요" },
  { href: "/student/alphabet/match", emoji: "🔠", title: "대소문자 짝 맞추기", desc: "큰 글자와 작은 글자를 짝지어요" },
  { href: "/student/alphabet/first", emoji: "🍎", title: "첫 글자 찾기", desc: "그림 단어가 어떤 글자로 시작하는지 골라요" },
];

// 알파벳 익히기: 글자 카드로 배우고, 세 가지 놀이로 연습
export default function AlphabetHome() {
  const child = useActiveChild();
  const { progress } = useAlphabetProgress(child.id);
  const [open, setOpen] = useState<number | null>(null);

  // 카드를 열면 글자 이름을 들려준다
  useEffect(() => {
    if (open !== null) speakEnglish(letterSpeech(LETTERS[open].letter));
  }, [open]);

  if (!progress) return <AlphabetLoading />;
  const mastered = masteredCount(progress);
  const card = open !== null ? LETTERS[open] : null;

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <Link href="/student" className="p-2 text-gray-500 hover:bg-white rounded-xl" aria-label="뒤로">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-800">알파벳 익히기 🔤</h1>
        </div>

        <div className="bg-white rounded-3xl p-5 shadow-md mb-6" aria-label="익힌 글자">
          <div className="flex items-baseline justify-between">
            <p className="font-bold text-gray-800">익힌 글자</p>
            <p className="text-gray-800">
              <b className="text-2xl text-orange-500">{mastered}</b> / 26
            </p>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden mt-2">
            <div className="h-full bg-gradient-to-r from-yellow-400 to-orange-400 rounded-full transition-all" style={{ width: `${(mastered / 26) * 100}%` }} />
          </div>
          <p className="text-xs text-gray-400 mt-2">같은 글자를 3번 연속으로 맞히면 익힌 글자가 돼요</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
          {ACTIVITIES.map((a) => (
            <Link key={a.href} href={a.href} className="bg-white rounded-3xl p-5 shadow-md hover:shadow-lg active:scale-[0.98] transition-all">
              <div className="text-4xl" aria-hidden>
                {a.emoji}
              </div>
              <p className="font-bold text-gray-800 mt-2">{a.title}</p>
              <p className="text-sm text-gray-500 mt-1">{a.desc}</p>
            </Link>
          ))}
        </div>

        <h2 className="text-lg font-bold text-gray-800 mb-3">글자를 눌러 배워요</h2>
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-7 gap-2" aria-label="알파벳 글자">
          {LETTERS.map((l, i) => {
            const done = progress[l.letter]?.mastered;
            return (
              <button
                key={l.letter}
                onClick={() => setOpen(i)}
                aria-label={`${l.letter} 배우기`}
                data-mastered={done ? "true" : "false"}
                className={`relative aspect-square rounded-2xl shadow-sm flex items-center justify-center text-2xl font-extrabold active:scale-95 transition-transform ${
                  done ? "bg-green-100 text-green-700" : "bg-white text-gray-800"
                }`}
              >
                {l.letter}
                <span className="text-lg font-bold opacity-70">{l.letter.toLowerCase()}</span>
                {done && <Check className="absolute top-1 right-1 w-4 h-4 text-green-600" />}
              </button>
            );
          })}
        </div>
      </div>

      {card && open !== null && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`${card.letter} 글자 카드`}>
          <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-sm w-full text-center relative">
            <button onClick={() => setOpen(null)} className="absolute top-3 right-3 p-2 text-gray-400 hover:text-gray-600" aria-label="닫기">
              <X className="w-6 h-6" />
            </button>
            <p className="text-8xl font-extrabold text-gray-800 leading-none mt-2">
              {card.letter}
              <span className="text-orange-500">{card.letter.toLowerCase()}</span>
            </p>
            <button
              onClick={() => speakEnglish(letterSpeech(card.letter))}
              className="mt-4 inline-flex items-center gap-2 px-5 py-2 rounded-full bg-blue-50 text-blue-600 font-bold"
            >
              <Volume2 className="w-5 h-5" />
              글자 이름 듣기
            </button>
            <div className="mt-6 p-4 bg-yellow-50 rounded-2xl">
              <div className="text-6xl" aria-hidden>
                {card.emoji}
              </div>
              <p className="text-2xl font-bold text-gray-800 mt-2">
                {card.firstLetter ? (
                  <>
                    <span className="text-orange-500">{card.word[0]}</span>
                    {card.word.slice(1)}
                  </>
                ) : (
                  <>
                    {card.word.slice(0, -1)}
                    <span className="text-orange-500">{card.word.slice(-1)}</span>
                  </>
                )}
              </p>
              <p className="text-gray-500">{card.korean}</p>
              {!card.firstLetter && <p className="text-xs text-gray-400 mt-1">{card.letter.toLowerCase()}는 단어 끝에 있어요</p>}
              <button onClick={() => speakEnglish(card.word)} className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white text-gray-700 font-bold shadow-sm">
                <Volume2 className="w-5 h-5" />
                단어 듣기
              </button>
            </div>
            <div className="flex justify-between mt-6">
              <button
                onClick={() => setOpen((open + 25) % 26)}
                className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-gray-100 text-gray-700 font-bold"
                aria-label="이전 글자"
              >
                <ChevronLeft className="w-5 h-5" />
                {LETTERS[(open + 25) % 26].letter}
              </button>
              <button
                onClick={() => setOpen((open + 1) % 26)}
                className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-gray-100 text-gray-700 font-bold"
                aria-label="다음 글자"
              >
                {LETTERS[(open + 1) % 26].letter}
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
