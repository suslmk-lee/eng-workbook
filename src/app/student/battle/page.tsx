"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, RotateCcw, Heart } from "lucide-react";
import { Word, WordSet } from "@/lib/types";
import { getWordSets, saveLearningRecord, addReward } from "@/lib/api";
import { speakEnglish } from "@/lib/speech";
import { shuffleArray, cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { playCorrectSound, playWrongSound, playComboSound } from "@/lib/sound";

const BOSSES = [
  { emoji: "👾", name: "단어 도둑 글리치" },
  { emoji: "🐉", name: "스펠링 드래곤" },
  { emoji: "🧌", name: "깜빡깜빡 트롤" },
  { emoji: "👻", name: "오답 유령" },
  { emoji: "🤖", name: "철자 파괴 로봇" },
];

const PLAYER_MAX_HP = 100;
const WRONG_DAMAGE = 25; // 4번 틀리면 패배
const ATTACK_DAMAGE = 10;
const CRIT_DAMAGE = 15; // 2콤보 이상

type Phase = "playing" | "victory" | "defeat" | "escaped";

function HpBar({ hp, maxHp, color }: { hp: number; maxHp: number; color: string }) {
  const pct = Math.max(0, (hp / maxHp) * 100);
  return (
    <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
      <div
        className={cn("h-3 rounded-full transition-all duration-500", color)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function BattleContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const setId = searchParams.get("setId");
  const [words, setWords] = useState<Word[]>([]);
  const [boss, setBoss] = useState(BOSSES[0]);
  const [bossMaxHp, setBossMaxHp] = useState(100);
  const [bossHp, setBossHp] = useState(100);
  const [playerHp, setPlayerHp] = useState(PLAYER_MAX_HP);
  const [qIndex, setQIndex] = useState(0);
  const [options, setOptions] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [combo, setCombo] = useState(0);
  const [results, setResults] = useState<{ word: Word; correct: boolean }[]>([]);
  const [phase, setPhase] = useState<Phase>("playing");
  const [loading, setLoading] = useState(true);
  const [bossHit, setBossHit] = useState(false);
  const [playerHit, setPlayerHit] = useState(false);
  const [damagePopup, setDamagePopup] = useState<{ value: number; crit: boolean } | null>(null);

  useEffect(() => {
    loadWords();
  }, [setId]);

  useEffect(() => {
    if (words.length > 0 && qIndex < words.length) {
      makeOptions();
    }
  }, [qIndex, words]);

  async function loadWords() {
    const sets = await getWordSets();
    const targetSet = sets.find((s: WordSet) => s.id === setId) || sets[0];
    if (targetSet?.words && targetSet.words.length > 0) {
      const shuffled = shuffleArray(targetSet.words);
      setWords(shuffled);
      setBoss(BOSSES[Math.floor(Math.random() * BOSSES.length)]);
      const maxHp = shuffled.length * ATTACK_DAMAGE;
      setBossMaxHp(maxHp);
      setBossHp(maxHp);
    }
    setLoading(false);
  }

  function makeOptions() {
    const answer = words[qIndex].english;
    const distractors = shuffleArray(
      words.filter((w) => w.english !== answer).map((w) => w.english)
    ).slice(0, 3);
    setOptions(shuffleArray([answer, ...distractors]));
    setSelected(null);
  }

  function handleAnswer(option: string) {
    if (selected !== null || phase !== "playing") return;
    setSelected(option);

    const currentWord = words[qIndex];
    const correct = option === currentWord.english;
    const newResults = [...results, { word: currentWord, correct }];
    setResults(newResults);
    saveLearningRecord(currentWord.id, "battle", correct, undefined, user?.id);

    let nextBossHp = bossHp;
    let nextPlayerHp = playerHp;

    if (correct) {
      const newCombo = combo + 1;
      setCombo(newCombo);
      const crit = newCombo >= 2;
      const dmg = crit ? CRIT_DAMAGE : ATTACK_DAMAGE;
      nextBossHp = Math.max(0, bossHp - dmg);
      setBossHp(nextBossHp);
      setBossHit(true);
      setDamagePopup({ value: dmg, crit });
      playCorrectSound();
      if (crit) playComboSound(newCombo);
      setTimeout(() => setBossHit(false), 500);
    } else {
      setCombo(0);
      nextPlayerHp = Math.max(0, playerHp - WRONG_DAMAGE);
      setPlayerHp(nextPlayerHp);
      setPlayerHit(true);
      playWrongSound();
      speakEnglish(currentWord.english);
      setTimeout(() => setPlayerHit(false), 500);
    }

    setTimeout(() => {
      setDamagePopup(null);
      if (nextBossHp <= 0) {
        finishBattle("victory", newResults);
      } else if (nextPlayerHp <= 0) {
        finishBattle("defeat", newResults);
      } else if (qIndex < words.length - 1) {
        setQIndex(qIndex + 1);
      } else {
        finishBattle("escaped", newResults);
      }
    }, 1200);
  }

  async function finishBattle(outcome: Phase, finalResults: { word: Word; correct: boolean }[]) {
    setPhase(outcome);
    const correctCount = finalResults.filter((r) => r.correct).length;
    const total = words.length;
    if (correctCount === total) {
      await addReward("trophy", "몬스터 배틀 완벽 승리! 🏆", "battle", user?.id);
    } else if (correctCount >= total * 0.8) {
      await addReward("star", "몬스터 배틀 80% 이상! ⭐", "battle", user?.id);
    }
  }

  function handleRetry() {
    setQIndex(0);
    setCombo(0);
    setResults([]);
    setPlayerHp(PLAYER_MAX_HP);
    setPhase("playing");
    setSelected(null);
    loadWords();
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-4xl animate-bounce-slow">⚔️</div>
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

  // ===== 결과 화면 =====
  if (phase !== "playing") {
    const correctCount = results.filter((r) => r.correct).length;
    const headline =
      phase === "victory"
        ? { emoji: "🎉", title: "승리!", sub: `${boss.name}을(를) 물리쳤어요!` }
        : phase === "defeat"
          ? { emoji: "😵", title: "패배...", sub: "다시 도전해서 복수해요!" }
          : { emoji: "💨", title: "몬스터가 도망갔어요!", sub: "다음엔 더 세게 공격해봐요!" };

    return (
      <div className="min-h-screen p-4 md:p-8">
        <div className="max-w-2xl mx-auto text-center py-12">
          <div className="text-7xl mb-4">{headline.emoji}</div>
          <h2 className="text-3xl font-bold text-gray-800 mb-1">{headline.title}</h2>
          <p className="text-gray-500 mb-6">{headline.sub}</p>
          <div className="text-5xl font-extrabold my-6">
            <span className={correctCount >= results.length * 0.8 ? "text-green-600" : "text-orange-500"}>
              {correctCount}
            </span>
            <span className="text-gray-300"> / {results.length}</span>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-md mb-8 text-left">
            {results.map((r, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                <span className={r.correct ? "text-green-600" : "text-red-500"}>{r.correct ? "⚔️" : "💔"}</span>
                <span className="font-medium">{r.word.english}</span>
                <span className="text-gray-400">{r.word.korean}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-3 justify-center">
            <button onClick={handleRetry} className="btn-kid bg-kid-blue">
              <RotateCcw className="w-5 h-5 inline mr-2" />다시 도전
            </button>
            <Link href="/student" className="btn-kid bg-kid-green">다른 학습</Link>
          </div>
        </div>
      </div>
    );
  }

  // ===== 전투 화면 =====
  const currentWord = words[qIndex];

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Link href="/student" className="p-2 hover:bg-white rounded-xl transition-colors">
              <ArrowLeft className="w-6 h-6 text-gray-600" />
            </Link>
            <h1 className="text-2xl font-bold text-gray-800">몬스터 배틀</h1>
          </div>
          <div className="flex items-center gap-2">
            {combo >= 2 && (
              <span className="animate-combo bg-rose-400 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                🔥 {combo}콤보
              </span>
            )}
            <span className="text-sm text-gray-500">{qIndex + 1} / {words.length}</span>
          </div>
        </div>

        {/* 보스 */}
        <div className="bg-gradient-to-b from-purple-100 to-white rounded-3xl p-6 shadow-md mb-4 relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-purple-800 text-sm">{boss.name}</span>
            <span className="text-xs text-purple-500 font-bold">{bossHp} / {bossMaxHp}</span>
          </div>
          <HpBar hp={bossHp} maxHp={bossMaxHp} color="bg-gradient-to-r from-purple-500 to-rose-500" />
          <div className="text-center relative">
            <div
              className={cn(
                "text-8xl inline-block transition-transform duration-150 mt-4",
                bossHit && "scale-90 rotate-12 brightness-150"
              )}
            >
              {boss.emoji}
            </div>
            {damagePopup && (
              <div
                className={cn(
                  "absolute top-2 left-1/2 -translate-x-1/2 font-extrabold animate-bounce",
                  damagePopup.crit ? "text-rose-500 text-3xl" : "text-purple-600 text-2xl"
                )}
              >
                -{damagePopup.value}{damagePopup.crit && " 크리티컬!"}
              </div>
            )}
          </div>
        </div>

        {/* 플레이어 HP */}
        <div
          className={cn(
            "bg-white rounded-2xl p-4 shadow-md mb-4 transition-colors duration-300",
            playerHit && "bg-red-100"
          )}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-gray-700 text-sm flex items-center gap-1">
              🦸 나의 체력
              <Heart className="w-4 h-4 text-red-400 fill-red-400" />
            </span>
            <span className="text-xs text-gray-500 font-bold">{playerHp} / {PLAYER_MAX_HP}</span>
          </div>
          <HpBar hp={playerHp} maxHp={PLAYER_MAX_HP} color="bg-gradient-to-r from-green-400 to-emerald-500" />
        </div>

        {/* 문제 */}
        <div className="bg-white rounded-2xl p-5 shadow-md mb-4 text-center">
          <p className="text-xs text-gray-400 mb-1">알맞은 영어 주문을 골라 공격하세요!</p>
          <h2 className="text-2xl font-bold text-gray-800">{currentWord.korean}</h2>
        </div>

        {/* 보기 */}
        <div className="grid grid-cols-2 gap-3">
          {options.map((option) => {
            const isAnswer = option === currentWord.english;
            const isSelected = option === selected;
            return (
              <button
                key={option}
                onClick={() => handleAnswer(option)}
                disabled={selected !== null}
                className={cn(
                  "py-4 px-3 rounded-2xl font-bold text-lg shadow-sm transition-all",
                  selected === null && "bg-white hover:bg-rose-50 hover:scale-105 active:scale-95 text-gray-800",
                  selected !== null && isAnswer && "bg-green-500 text-white",
                  selected !== null && isSelected && !isAnswer && "bg-red-400 text-white",
                  selected !== null && !isSelected && !isAnswer && "bg-gray-100 text-gray-400"
                )}
              >
                {option}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function BattlePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-4xl animate-bounce-slow">⚔️</div></div>}>
      <BattleContent />
    </Suspense>
  );
}
