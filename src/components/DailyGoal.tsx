"use client";

import { useState } from "react";
import { ChevronDown, Flame, Target } from "lucide-react";
import type { GoalDayStatus, GoalStatus } from "@/lib/api";

// 오늘의 목표·연속 학습·도장판 (아이 화면과 부모 화면에서 함께 씀)

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];

// 칭찬 도장 ("참 잘했어요"). 이모지 💮는 애플 기기에서 일본어 도장으로 보여서 직접 그린다
export function Stamp({ size = "md", animate = false }: { size?: "sm" | "md" | "lg"; animate?: boolean }) {
  const box = size === "lg" ? "w-28 h-28 border-[5px]" : size === "md" ? "w-14 h-14 border-[3px]" : "w-6 h-6 border-2";
  return (
    <span
      className={`${box} ${animate ? "animate-stamp" : "-rotate-12"} inline-flex items-center justify-center rounded-full border-red-500 text-red-500 font-extrabold leading-none bg-white/60 shrink-0`}
      aria-hidden
    >
      {size === "sm" ? (
        <span className="text-[11px]">참</span>
      ) : (
        <span className={`text-center ${size === "lg" ? "text-xl" : "text-[11px]"}`}>
          참<br />잘했어요
        </span>
      )}
    </span>
  );
}

function parseDay(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// 이번 달 도장판 (월요일 시작)
export function StampCalendar({ status }: { status: GoalStatus }) {
  const today = parseDay(status.today);
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // 월요일 = 0
  const byDay = new Map(status.days.map((d) => [d.day, d.status]));
  const metCount = status.days.filter((d) => d.status === "met" && d.day.slice(0, 7) === status.today.slice(0, 7)).length;

  const cells: (null | { date: number; key: string; st: GoalDayStatus | "future" | "blank" })[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let date = 1; date <= daysInMonth; date++) {
    const key = dayKey(new Date(today.getFullYear(), today.getMonth(), date));
    const st = key > status.today ? "future" : (byDay.get(key) ?? "blank");
    cells.push({ date, key, st });
  }

  return (
    <div aria-label="도장판">
      <div className="flex items-baseline justify-between mb-2">
        <p className="font-bold text-gray-800">{today.getMonth() + 1}월 도장판</p>
        <p className="text-xs text-gray-500">
          도장 <b className="text-red-500">{metCount}</b>개 · 최고 연속 {status.best_streak}일
        </p>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-gray-400 py-1">{w}</div>
        ))}
        {cells.map((c, i) =>
          c === null ? (
            <div key={`b${i}`} />
          ) : (
            <div
              key={c.key}
              data-day={c.key}
              data-status={c.st}
              className={`aspect-square rounded-xl flex flex-col items-center justify-center relative ${
                c.st === "met"
                  ? "bg-red-50"
                  : c.st === "rest"
                    ? "bg-indigo-50"
                    : c.st === "today"
                      ? "ring-2 ring-primary-400 bg-white"
                      : c.st === "missed"
                        ? "bg-gray-100"
                        : ""
              }`}
              title={
                c.st === "met" ? "목표 완료" : c.st === "rest" ? "쉬는 날 (연속 기록 이어짐)" : c.st === "missed" ? "못 했어요" : undefined
              }
            >
              <span className={`text-[10px] leading-none ${c.st === "future" || c.st === "blank" || c.st === "none" ? "text-gray-300" : "text-gray-500"}`}>
                {c.date}
              </span>
              {c.st === "met" && (
                <span className="mt-0.5">
                  <Stamp size="sm" />
                </span>
              )}
              {c.st === "rest" && <span className="text-sm leading-none mt-0.5">🌙</span>}
            </div>
          )
        )}
      </div>
      <p className="text-[11px] text-gray-400 mt-2 flex items-start gap-1.5">
        <Stamp size="sm" />
        <span className="pt-1">목표 완료 · 🌙 쉬는 날 (일주일에 하루는 쉬어도 연속 기록이 이어져요)</span>
      </p>
    </div>
  );
}

// 연속 기록 안내 문구 (잃는 것보다 얻는 것을 말한다)
function streakLine(s: GoalStatus): string {
  if (s.met) return `내일도 하면 ${s.streak + 1}일 연속!`;
  if (s.streak > 0) return `오늘 하면 ${s.streak + 1}일 연속!`;
  return "오늘 하면 1일 연속 시작!";
}

// 아이 화면: 오늘의 목표 카드
export function DailyGoalCard({ status }: { status: GoalStatus }) {
  const [showCalendar, setShowCalendar] = useState(false);
  const pct = status.goal_words > 0 ? Math.round((status.done_words / status.goal_words) * 100) : 0;

  return (
    <div
      className={`rounded-3xl p-5 shadow-md mb-6 ${status.met ? "bg-gradient-to-r from-red-50 to-yellow-50" : "bg-white"}`}
      aria-label="오늘의 목표"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-red-400" />
          <h2 className="text-lg font-bold text-gray-800">오늘의 목표</h2>
        </div>
        <div className="flex items-center gap-1 bg-orange-50 text-orange-600 px-3 py-1 rounded-full font-bold text-sm" aria-label="연속 학습">
          <Flame className="w-4 h-4" />
          {status.streak}일 연속
        </div>
      </div>

      {status.met ? (
        <div className="flex items-center gap-4 mt-3">
          <Stamp size="md" animate />
          <div>
            <p className="text-xl font-extrabold text-red-500">오늘 목표 완료!</p>
            <p className="text-sm text-gray-600">{streakLine(status)} 오늘은 이 정도면 충분해요.</p>
          </div>
        </div>
      ) : status.goal_words === 0 ? (
        <p className="text-sm text-gray-500 mt-3">
          오늘은 정해진 단어가 없어요. 아래 <b>주제별 단어장</b>으로 공부해 볼까요?
        </p>
      ) : (
        <div className="mt-3">
          <p className="text-sm text-gray-600 mb-2">
            오늘 단어를 <b>모두 한 번씩 맞혀요</b> · {streakLine(status)}
          </p>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={status.done_words} aria-valuemin={0} aria-valuemax={status.goal_words}>
              <div className="h-full bg-gradient-to-r from-orange-400 to-red-400 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
            </div>
            <span className="font-extrabold text-gray-800 whitespace-nowrap">
              {status.done_words} / {status.goal_words}
            </span>
          </div>
          {status.remaining.length > 0 && (
            <p className="text-xs text-gray-500 mt-2">
              아직 안 맞힌 단어: {status.remaining.slice(0, 8).join(", ")}
              {status.remaining.length > 8 && ` 외 ${status.remaining.length - 8}개`}
            </p>
          )}
          <p className="text-[11px] text-gray-400 mt-1">퀴즈·스펠링·매칭 같은 학습에서 맞히면 채워져요 (카드 넘기기는 빼고)</p>
        </div>
      )}

      <button
        onClick={() => setShowCalendar((v) => !v)}
        className="mt-3 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        aria-expanded={showCalendar}
      >
        도장판 {showCalendar ? "접기" : "보기"}
        <ChevronDown className={`w-4 h-4 transition-transform ${showCalendar ? "rotate-180" : ""}`} />
      </button>
      {showCalendar && (
        <div className="mt-3">
          <StampCalendar status={status} />
        </div>
      )}
    </div>
  );
}

// 목표를 다 채우고 처음 홈으로 돌아왔을 때 축하 화면
export function GoalCelebration({ status, onClose }: { status: GoalStatus; onClose: () => void }) {
  const newBest = status.streak >= 2 && status.streak >= status.best_streak;
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="오늘의 목표 완료">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full text-center">
        <Stamp size="lg" animate />
        <h2 className="text-2xl font-extrabold text-gray-800 mt-4">오늘의 목표 완료!</h2>
        <p className="text-gray-600 mt-2">오늘 단어를 모두 맞혔어요. 정말 잘했어요!</p>
        <div className="mt-4 inline-flex items-center gap-2 bg-orange-50 text-orange-600 px-4 py-2 rounded-full font-extrabold text-lg">
          <Flame className="w-5 h-5" />
          {status.streak}일 연속
        </div>
        {newBest && <p className="text-sm font-bold text-red-500 mt-2">🎉 최고 기록이에요!</p>}
        <button onClick={onClose} className="btn-kid bg-kid-blue w-full mt-6">
          좋아요!
        </button>
      </div>
    </div>
  );
}

// 부모 화면: 자녀 한 줄 요약
export function goalSummaryText(status: GoalStatus | null, autoLesson: boolean): { icon: string; text: string } {
  if (!status) return { icon: "❔", text: "불러오지 못했어요" };
  if (status.met) return { icon: "✅", text: "오늘 목표 완료" };
  if (status.done_words > 0) return { icon: "✏️", text: `오늘 ${status.done_words}/${status.goal_words}개 진행 중` };
  if (status.goal_words > 0 || autoLesson) return { icon: "⏳", text: "오늘은 아직 안 했어요" };
  return { icon: "➖", text: "오늘 목표 없음 (숙제 없음·오늘의 학습 꺼짐)" };
}
