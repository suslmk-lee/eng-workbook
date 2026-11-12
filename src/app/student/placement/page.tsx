"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Volume2, Target } from "lucide-react";
import { useActiveChild } from "@/lib/child-mode";
import { getDictionary, submitPlacement, PlacementResult } from "@/lib/api";
import { DictionaryWord, LEVEL_LABELS } from "@/lib/types";
import { shuffleArray } from "@/lib/utils";
import { speakEnglish } from "@/lib/speech";

// 레벨 테스트: 레벨마다 4문제(영어 → 뜻 고르기). 3문제 이상 맞히면 다음 레벨,
// 못 맞히면 그 레벨에서 끝낸다. 맞힌 단어는 서버에서 "아는 단어"로 표시된다.
const PER_LEVEL = 4;
const PASS = 3;
const DONT_KNOW = "__dont_know__";

interface Question {
  english: string;
  korean: string;
  level: number;
  options: string[];
}

function buildQuestions(dict: DictionaryWord[]): Question[] {
  const questions: Question[] = [];
  // 사전에 있는 레벨 순서대로 (1~7)
  const levels = Array.from(new Set(dict.map((w) => w.level))).sort((a, b) => a - b);
  for (const level of levels) {
    const pool = dict.filter((w) => w.level === level);
    for (const word of shuffleArray(pool).slice(0, PER_LEVEL)) {
      const distractors = shuffleArray(pool.filter((w) => w.korean !== word.korean))
        .slice(0, 3)
        .map((w) => w.korean);
      questions.push({
        english: word.english,
        korean: word.korean,
        level,
        options: shuffleArray([word.korean, ...distractors]),
      });
    }
  }
  return questions;
}

type Answer = { english: string; correct: boolean; level: number };

export default function PlacementPage() {
  const child = useActiveChild();
  const [phase, setPhase] = useState<"loading" | "intro" | "quiz" | "saving" | "done" | "error">("loading");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [result, setResult] = useState<PlacementResult | null>(null);

  useEffect(() => {
    getDictionary().then((dict) => {
      if (dict.length === 0) {
        setPhase("error");
        return;
      }
      setQuestions(buildQuestions(dict));
      setPhase("intro");
    });
  }, []);

  function answer(option: string) {
    if (picked) return;
    const q = questions[index];
    const next = [...answers, { english: q.english, correct: option === q.korean, level: q.level }];
    setPicked(option);
    setAnswers(next);

    setTimeout(() => {
      setPicked(null);
      const levelDone = (index + 1) % PER_LEVEL === 0;
      if (levelDone) {
        const correct = next.filter((a) => a.level === q.level && a.correct).length;
        if (correct < PASS || index + 1 >= questions.length) {
          finish(next);
          return;
        }
      }
      setIndex(index + 1);
    }, 350);
  }

  async function finish(all: Answer[]) {
    setPhase("saving");
    const r = await submitPlacement(
      child.id,
      all.map(({ english, correct }) => ({ english, correct }))
    );
    if (!r) {
      setPhase("error");
      return;
    }
    // 홈으로 돌아가면 새 수준으로 다시 만든 오늘의 학습이 먼저 선택되게
    try {
      sessionStorage.removeItem(`ew_selected_set_v1:${child.id}`);
    } catch {}
    setResult(r);
    setPhase("done");
  }

  const q = questions[index];

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Link href="/student" className="p-2 text-gray-500 hover:bg-white rounded-xl" aria-label="뒤로">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Target className="w-5 h-5 text-primary-500" /> 레벨 테스트
          </h1>
          <div className="w-10" />
        </div>

        {phase === "loading" && <p className="text-center text-gray-500 py-16">준비 중...</p>}

        {phase === "intro" && (
          <div className="bg-white rounded-3xl shadow-md p-8 text-center">
            <div className="text-6xl mb-4">🎯</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-3">{child.name}의 영어 레벨을 알아봐요</h2>
            <p className="text-gray-600 mb-2">영어 단어를 보고 알맞은 뜻을 골라요.</p>
            <p className="text-gray-600 mb-6">
              모르면 <b>모르겠어요</b>를 눌러요. 틀려도 괜찮아요!
              <br />
              <span className="text-sm text-gray-400">3~5분 정도 걸려요</span>
            </p>
            <button onClick={() => setPhase("quiz")} className="btn-kid bg-kid-blue w-full mb-3">
              시작하기
            </button>
            <Link href="/student" className="block text-sm text-gray-400">
              나중에 할래요
            </Link>
          </div>
        )}

        {phase === "quiz" && q && (
          <div>
            <div className="mb-4">
              <div className="flex justify-between text-sm text-gray-500 mb-1">
                <span>{index + 1}번째 문제</span>
                <span>최대 {questions.length}문제</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-500 transition-all"
                  style={{ width: `${((index + 1) / questions.length) * 100}%` }}
                />
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-md p-8 text-center mb-4">
              <p className="text-sm text-gray-400 mb-2">이 단어의 뜻은?</p>
              <h2 className="text-4xl font-bold text-gray-800 mb-3">{q.english}</h2>
              <button
                onClick={() => speakEnglish(q.english)}
                className="p-3 bg-blue-100 rounded-full hover:bg-blue-200"
                aria-label="발음 듣기"
              >
                <Volume2 className="w-6 h-6 text-blue-600" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              {q.options.map((opt) => (
                <button
                  key={opt}
                  onClick={() => answer(opt)}
                  disabled={!!picked}
                  className={`p-4 rounded-2xl text-lg font-medium text-left transition-all ${
                    picked === opt ? "bg-primary-500 text-white" : "bg-white shadow-sm hover:shadow-md text-gray-800"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
            <button
              onClick={() => answer(DONT_KNOW)}
              disabled={!!picked}
              className={`w-full p-3 rounded-2xl text-gray-500 ${picked === DONT_KNOW ? "bg-gray-300" : "bg-gray-100 hover:bg-gray-200"}`}
            >
              모르겠어요
            </button>
          </div>
        )}

        {phase === "saving" && <p className="text-center text-gray-500 py-16">결과를 정리하고 있어요...</p>}

        {phase === "done" && result && (
          <div className="bg-white rounded-3xl shadow-md p-8 text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">테스트 끝!</h2>
            <p className="text-lg text-primary-600 font-bold mb-4">
              {LEVEL_LABELS[result.start_level] ?? `레벨 ${result.start_level}`}부터 시작해요
            </p>
            <p className="text-gray-600 mb-6">
              이미 아는 단어 <b>{result.known_words}개</b>를 찾았어요.
              <br />
              <span className="text-sm text-gray-400">아는 단어는 새 단어로 나오지 않고, 며칠 뒤 복습으로 한 번 더 확인해요.</span>
            </p>
            <Link href="/student" className="btn-kid bg-kid-green inline-block w-full">
              오늘의 학습 하러 가기
            </Link>
          </div>
        )}

        {phase === "error" && (
          <div className="bg-white rounded-3xl shadow-md p-8 text-center">
            <div className="text-5xl mb-4">😥</div>
            <p className="text-gray-600 mb-6">문제가 생겼어요. 잠시 후 다시 해 주세요.</p>
            {answers.length > 0 ? (
              <button onClick={() => finish(answers)} className="btn-kid bg-kid-blue w-full mb-3">
                결과 다시 저장하기
              </button>
            ) : null}
            <Link href="/student" className="block text-sm text-gray-400">
              돌아가기
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
