"use client";

import { useState, useEffect } from "react";
import { Volume2, Volume1 } from "lucide-react";

type TtsMode = "cache" | "direct" | "fallback";

const MODE_INFO: Record<TtsMode, { icon: typeof Volume2; label: string; detail: string; className: string }> = {
  cache: {
    icon: Volume2,
    label: "고품질 발음",
    detail: "OpenAI 음성 + 캐싱 — 빠르고 비용 효율적",
    className: "bg-green-50 text-green-700",
  },
  direct: {
    icon: Volume2,
    label: "고품질 발음 (캐싱 없음)",
    detail: "OpenAI 음성 — 재생마다 생성되어 첫 재생이 느릴 수 있음",
    className: "bg-blue-50 text-blue-700",
  },
  fallback: {
    icon: Volume1,
    label: "기기 내장 발음",
    detail: "브라우저 내장 음성 — 기기마다 품질이 다를 수 있음",
    className: "bg-gray-100 text-gray-500",
  },
};

/** 현재 TTS 동작 모드를 조회해 작은 배지로 표시 */
export default function TtsStatusBadge() {
  const [mode, setMode] = useState<TtsMode | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/tts")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { mode?: TtsMode } | null) => {
        if (!cancelled && data?.mode && data.mode in MODE_INFO) setMode(data.mode);
      })
      .catch(() => {
        if (!cancelled) setMode("fallback");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!mode) return null;

  const { icon: Icon, label, detail, className } = MODE_INFO[mode];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${className}`}
      title={detail}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </span>
  );
}
