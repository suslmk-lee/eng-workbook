"use client";

import { useState, useEffect } from "react";
import { Cloud, Smartphone } from "lucide-react";
import { getTtsMode, setTtsMode, TtsMode } from "@/lib/speech";

type ServerMode = "cache" | "direct" | "fallback";

/** 학생 화면용 발음 방식 선택 토글 (고품질 인터넷 음성 ↔ 기기 내장 음성) */
export default function TtsModeToggle() {
  const [mode, setMode] = useState<TtsMode | null>(null);
  const [serverMode, setServerMode] = useState<ServerMode | null>(null);

  useEffect(() => {
    setMode(getTtsMode());
    let cancelled = false;
    fetch("/api/tts")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { mode?: ServerMode } | null) => {
        if (!cancelled && data?.mode) setServerMode(data.mode);
      })
      .catch(() => {
        if (!cancelled) setServerMode("fallback");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (mode === null) return null;

  const cloudAvailable = serverMode !== "fallback";
  // 서버에 키가 없으면 어차피 기기 음성으로 폴백되므로 선택지를 비활성화
  const effectiveMode = cloudAvailable ? mode : "device";

  function select(next: TtsMode) {
    setTtsMode(next);
    setMode(next);
  }

  return (
    <div className="bg-white rounded-2xl p-4 shadow-md mb-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-sm font-bold text-gray-700">🔊 발음 방식</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => select("cloud")}
            disabled={!cloudAvailable}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold transition-all ${
              effectiveMode === "cloud"
                ? "bg-blue-500 text-white shadow"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <Cloud className="w-4 h-4" />
            고품질 발음
          </button>
          <button
            type="button"
            onClick={() => select("device")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold transition-all ${
              effectiveMode === "device"
                ? "bg-green-500 text-white shadow"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            <Smartphone className="w-4 h-4" />
            기기 발음
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-2">
        {!cloudAvailable
          ? "지금은 기기 발음만 사용할 수 있어요."
          : effectiveMode === "cloud"
            ? "인터넷에서 또렷한 음성을 가져와요. 처음 듣는 단어는 1~2초 기다릴 수 있어요."
            : "기기에 내장된 음성으로 바로 재생돼요. 기기마다 목소리가 다를 수 있어요."}
      </p>
    </div>
  );
}
