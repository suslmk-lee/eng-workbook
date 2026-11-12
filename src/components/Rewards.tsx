"use client";

import { useState } from "react";
import { ChevronDown, Gift, Sprout } from "lucide-react";
import type { BadgeState, ChildPromise, RewardsStatus } from "@/lib/api";
import { createPromise, updatePromise } from "@/lib/api";
import { badgeHow, badgeInfo, badgeProgress, earnedBadges, nextBadge } from "@/lib/badges";

// ============ 아이 화면 ============

// 부모님과의 약속: 도장 N개 모으면 ○○
export function PromiseCard({ promise }: { promise: ChildPromise }) {
  const done = promise.progress >= promise.target;
  const pct = Math.min(100, Math.round((promise.progress / promise.target) * 100));
  return (
    <div className={`rounded-3xl p-5 shadow-md mb-6 ${done ? "bg-gradient-to-r from-yellow-50 to-pink-50" : "bg-white"}`} aria-label="부모님과의 약속">
      <div className="flex items-center gap-2">
        <Gift className="w-5 h-5 text-pink-500" />
        <h2 className="text-lg font-bold text-gray-800">부모님과의 약속</h2>
      </div>
      <p className="text-gray-700 mt-2">
        도장 <b>{promise.target}개</b> 모으면 <b className="text-pink-600">{promise.reward}</b>
      </p>
      {done ? (
        <p className="text-lg font-extrabold text-pink-600 mt-2">🎉 약속 달성! 부모님께 알려 드려요</p>
      ) : (
        <div className="flex items-center gap-3 mt-3">
          <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={promise.progress} aria-valuemax={promise.target}>
            <div className="h-full bg-gradient-to-r from-pink-400 to-yellow-400 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
          </div>
          <span className="font-extrabold text-gray-800 whitespace-nowrap">
            {promise.progress} / {promise.target}
          </span>
        </div>
      )}
      {!done && <p className="text-xs text-gray-500 mt-2">도장 {promise.target - promise.progress}개만 더 모으면 돼요!</p>}
    </div>
  );
}

// 배지 모음 (받은 것은 색깔, 못 받은 것은 흐리게 + 받는 방법)
export function BadgeGrid({ status }: { status: RewardsStatus }) {
  return (
    <div className="grid grid-cols-4 sm:grid-cols-5 gap-2" aria-label="배지 모음">
      {status.badges.map((b) => {
        const info = badgeInfo(b.badge);
        const earned = !!b.earned_at;
        return (
          <div
            key={b.badge}
            data-badge={b.badge}
            data-earned={earned}
            className={`rounded-2xl p-2 text-center ${earned ? "bg-yellow-50" : "bg-gray-50"}`}
            title={badgeHow(b)}
          >
            <div className={`text-3xl leading-none ${earned ? "" : "grayscale opacity-30"}`} aria-hidden>
              {info.emoji}
            </div>
            <div className={`text-[11px] mt-1 font-medium break-keep ${earned ? "text-gray-800" : "text-gray-400"}`}>{info.name}</div>
            {!earned && b.threshold > 1 && (
              <div className="text-[10px] text-gray-400">
                {badgeProgress(status, b)}/{b.threshold}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// 내 성장: 외운 단어, 배지 수, 다음 배지
export function GrowthCard({ status }: { status: RewardsStatus }) {
  const [open, setOpen] = useState(false);
  const earned = earnedBadges(status).length;
  const next = nextBadge(status);
  const nextInfo = next ? badgeInfo(next.badge) : null;
  return (
    <div className="bg-white rounded-3xl p-5 shadow-md mb-6" aria-label="내 성장">
      <div className="flex items-center gap-2 mb-3">
        <Sprout className="w-5 h-5 text-green-500" />
        <h2 className="text-lg font-bold text-gray-800">내 성장</h2>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-green-50 rounded-2xl p-3 text-center">
          <div className="text-2xl font-extrabold text-green-600">{status.metrics.mastered_words ?? 0}</div>
          <div className="text-xs text-green-600 mt-0.5">외운 단어</div>
        </div>
        <div className="bg-yellow-50 rounded-2xl p-3 text-center">
          <div className="text-2xl font-extrabold text-yellow-600">
            {earned} <span className="text-base text-yellow-500">/ {status.badges.length}</span>
          </div>
          <div className="text-xs text-yellow-600 mt-0.5">받은 배지</div>
        </div>
      </div>
      {next && nextInfo && (
        <div className="mt-3 flex items-center gap-3" aria-label="다음 배지">
          <span className="text-3xl grayscale opacity-60" aria-hidden>
            {nextInfo.emoji}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-700">
              다음 배지 <b>{nextInfo.name}</b> · <span className="text-gray-500">{badgeHow(next)}</span>
            </p>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${(badgeProgress(status, next) / next.threshold) * 100}%` }} />
              </div>
              <span className="text-xs text-gray-500 whitespace-nowrap">
                {badgeProgress(status, next)}/{next.threshold}
              </span>
            </div>
          </div>
        </div>
      )}
      <p className="text-[11px] text-gray-400 mt-2">외운 단어: 서로 다른 날 3번 연속으로 맞힌 단어</p>
      <button onClick={() => setOpen((v) => !v)} className="mt-2 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700" aria-expanded={open}>
        배지 모음 {open ? "접기" : "보기"}
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-3">
          <BadgeGrid status={status} />
        </div>
      )}
    </div>
  );
}

// 새 배지·약속 달성 축하 (오늘의 목표 축하 다음에 이어서)
export function RewardCelebration({
  badges,
  promise,
  onClose,
}: {
  badges: BadgeState[];
  promise: ChildPromise | null; // 이번에 처음 달성한 약속
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="새 배지">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full text-center">
        {promise && (
          <div className="mb-5">
            <div className="text-6xl animate-pop-in inline-block" aria-hidden>
              🎁
            </div>
            <h2 className="text-2xl font-extrabold text-pink-600 mt-2">약속 달성!</h2>
            <p className="text-gray-700 mt-1">
              도장 {promise.target}개를 모았어요. <b>{promise.reward}</b>! 부모님께 알려 드려요.
            </p>
          </div>
        )}
        {badges.length > 0 && (
          <>
            <h2 className="text-xl font-extrabold text-gray-800">
              {badges.length === 1 ? "새 배지를 받았어요!" : `새 배지를 ${badges.length}개 받았어요!`}
            </h2>
            <div className="flex flex-wrap justify-center gap-3 mt-4">
              {badges.map((b) => {
                const info = badgeInfo(b.badge);
                return (
                  <div key={b.badge} className="w-20">
                    <div className="text-5xl animate-pop-in" aria-hidden>
                      {info.emoji}
                    </div>
                    <div className="text-xs font-bold text-gray-700 mt-1">{info.name}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}
        <button onClick={onClose} className="btn-kid bg-kid-blue w-full mt-6">
          좋아요!
        </button>
      </div>
    </div>
  );
}

// ============ 부모 화면 ============

const TARGET_OPTIONS = [5, 10, 20, 30, 50];

// 자녀 관리: 보상 약속 정하기·바꾸기·취소·지켰어요
export function PromiseEditor({
  childId,
  childName,
  promise,
  onChanged,
}: {
  childId: string;
  childName: string;
  promise: ChildPromise | null;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [reward, setReward] = useState(promise?.reward ?? "");
  const [target, setTarget] = useState(promise?.target ?? 20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function startEdit() {
    setReward(promise?.reward ?? "");
    setTarget(promise?.target ?? 20);
    setError("");
    setEditing(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!reward.trim()) {
      setError("약속 내용을 적어 주세요.");
      return;
    }
    setBusy(true);
    const ok = promise
      ? await updatePromise(promise.id, { reward: reward.trim(), target })
      : await createPromise(childId, reward, target);
    setBusy(false);
    if (!ok) {
      setError("저장하지 못했어요. 다시 시도해 주세요.");
      return;
    }
    setEditing(false);
    onChanged();
  }

  async function finish(field: "fulfilled_at" | "canceled_at") {
    if (!promise) return;
    if (field === "canceled_at" && !confirm(`${childName}와(과)의 약속을 취소할까요?`)) return;
    setBusy(true);
    await updatePromise(promise.id, { [field]: new Date().toISOString() });
    setBusy(false);
    onChanged();
  }

  if (editing) {
    return (
      <form onSubmit={save} className="mt-3 p-3 bg-pink-50 rounded-2xl space-y-2 text-sm" aria-label={`${childName} 보상 약속`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-gray-700">도장</span>
          <select
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
            className="px-2 py-1 rounded-lg border border-gray-200 bg-white"
            aria-label="모을 도장 수"
          >
            {TARGET_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}개
              </option>
            ))}
          </select>
          <span className="text-gray-700">모으면</span>
          <input
            value={reward}
            onChange={(e) => setReward(e.target.value)}
            maxLength={40}
            placeholder="예: 놀이공원 가기"
            className="flex-1 min-w-[10rem] px-3 py-1.5 rounded-lg border border-gray-200 bg-white"
            aria-label="약속 내용"
          />
        </div>
        {error && <p className="text-red-500 text-xs">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={busy} className="px-3 py-1.5 rounded-lg bg-pink-500 text-white font-bold disabled:opacity-50">
            {promise ? "바꾸기" : "약속하기"}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg bg-white text-gray-600">
            닫기
          </button>
        </div>
        <p className="text-[11px] text-gray-500">오늘의 목표를 채운 날마다 도장이 하나씩 쌓여요. 약속은 아이 화면에 보여요.</p>
      </form>
    );
  }

  if (!promise) {
    return (
      <button onClick={startEdit} className="mt-3 text-sm text-pink-600 font-bold hover:underline">
        🎁 보상 약속 정하기
      </button>
    );
  }

  const done = promise.progress >= promise.target;
  return (
    <div className="mt-3 p-3 bg-pink-50 rounded-2xl text-sm" aria-label={`${childName} 보상 약속`}>
      <p className="text-gray-700">
        🎁 도장 <b>{promise.target}개</b> 모으면 <b>{promise.reward}</b>
        <span className="text-gray-500"> · 지금 {Math.min(promise.progress, promise.target)}/{promise.target}</span>
      </p>
      {done && <p className="text-pink-600 font-bold mt-1">🎉 달성했어요! 약속을 지켜 주세요</p>}
      <div className="flex gap-3 mt-2">
        {done ? (
          <button onClick={() => finish("fulfilled_at")} disabled={busy} className="px-3 py-1.5 rounded-lg bg-pink-500 text-white font-bold disabled:opacity-50">
            지켰어요
          </button>
        ) : (
          <button onClick={startEdit} className="text-gray-600 hover:underline">
            바꾸기
          </button>
        )}
        <button onClick={() => finish("canceled_at")} disabled={busy} className="text-gray-400 hover:text-red-500 hover:underline">
          약속 취소
        </button>
      </div>
    </div>
  );
}

// 학습 현황: 받은 배지 요약
export function BadgeSummary({ status }: { status: RewardsStatus }) {
  const [open, setOpen] = useState(false);
  const earned = earnedBadges(status);
  return (
    <div className="bg-white rounded-3xl p-6 shadow-md" aria-label="배지">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-lg font-bold text-gray-800">받은 배지</h3>
        <span className="text-sm text-gray-500">
          {earned.length} / {status.badges.length} · 외운 단어 {status.metrics.mastered_words ?? 0}개
        </span>
      </div>
      {earned.length === 0 ? (
        <p className="text-sm text-gray-400">아직 받은 배지가 없어요.</p>
      ) : (
        <p className="text-3xl tracking-wider" aria-label="받은 배지 목록">
          {earned.map((b) => (
            <span key={b.badge} title={badgeInfo(b.badge).name}>
              {badgeInfo(b.badge).emoji}
            </span>
          ))}
        </p>
      )}
      <button onClick={() => setOpen((v) => !v)} className="mt-3 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700" aria-expanded={open}>
        전체 배지 {open ? "접기" : "보기"}
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-3">
          <BadgeGrid status={status} />
        </div>
      )}
    </div>
  );
}
