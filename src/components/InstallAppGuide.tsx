"use client";

import { useEffect, useState } from "react";
import { Share, Smartphone, X } from "lucide-react";
import { canPromptInstall, isAppleMobile, isStandalone, onInstallPromptReady, promptInstall } from "@/lib/install-app";

const DISMISS_KEY = "ew_install_card_dismissed_v1";

type Mode = "standalone" | "apple" | "prompt" | "other";

function detect(): Mode {
  if (isStandalone()) return "standalone";
  if (isAppleMobile()) return "apple";
  if (canPromptInstall()) return "prompt";
  return "other";
}

function AppleSteps() {
  return (
    <ol className="list-decimal pl-5 space-y-1 text-sm text-gray-700">
      <li>
        사파리에서 <b>공유 버튼</b>
        <Share className="inline w-4 h-4 mx-1 -mt-0.5 text-primary-500" aria-label="공유" />을 눌러요
        <span className="text-gray-400"> (아이패드는 화면 위, 아이폰은 아래)</span>
      </li>
      <li>
        <b>홈 화면에 추가</b>를 누르고, 오른쪽 위 <b>추가</b>를 눌러요
      </li>
      <li>홈 화면에 생긴 <b>영어 단어</b> 아이콘으로 열면 주소창 없이 전체 화면으로 공부해요</li>
    </ol>
  );
}

// 부모 화면 맨 위 안내 카드 (설치할 수 있을 때만, "다음에"를 누르면 이 기기에서는 다시 안 뜸)
export function InstallAppCard() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => {
    setMode(detect());
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
    return onInstallPromptReady(() => setMode(detect()));
  }, []);

  if (dismissed || (mode !== "apple" && mode !== "prompt")) return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  }

  return (
    <div className="bg-white rounded-2xl p-4 shadow-md mb-4 border-2 border-primary-100" aria-label="앱으로 설치">
      <div className="flex items-start gap-3">
        <Smartphone className="w-6 h-6 text-primary-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-800">홈 화면에 앱으로 추가해 보세요</p>
          <p className="text-sm text-gray-500 mt-0.5">주소창 없이 전체 화면으로 열려서 아이가 공부하기 더 편해요.</p>
          {mode === "apple" && showSteps && (
            <div className="mt-3">
              <AppleSteps />
            </div>
          )}
          <div className="flex gap-2 mt-3">
            {mode === "apple" ? (
              !showSteps && (
                <button onClick={() => setShowSteps(true)} className="px-4 py-2 rounded-xl bg-primary-500 text-white text-sm font-bold">
                  추가하는 방법 보기
                </button>
              )
            ) : (
              <button
                onClick={async () => {
                  if (await promptInstall()) dismiss();
                  else setMode(detect());
                }}
                className="px-4 py-2 rounded-xl bg-primary-500 text-white text-sm font-bold"
              >
                앱으로 설치
              </button>
            )}
            <button onClick={dismiss} className="px-4 py-2 rounded-xl bg-gray-100 text-gray-600 text-sm font-medium">
              다음에
            </button>
          </div>
        </div>
        <button onClick={dismiss} className="p-1 text-gray-300 hover:text-gray-500" aria-label="안내 닫기">
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

// 내 계정 탭: 언제든 다시 볼 수 있는 설치 방법
export function InstallAppSection() {
  const [mode, setMode] = useState<Mode | null>(null);
  useEffect(() => {
    setMode(detect());
    return onInstallPromptReady(() => setMode(detect()));
  }, []);
  if (mode === null) return null;

  return (
    <div className="bg-white rounded-3xl p-6 shadow-md" aria-label="홈 화면 앱">
      <h2 className="text-xl font-bold text-gray-800 mb-2">홈 화면 앱</h2>
      {mode === "standalone" ? (
        <p className="text-sm text-gray-600">지금 홈 화면 앱으로 쓰고 있어요. 👍</p>
      ) : mode === "prompt" ? (
        <>
          <p className="text-sm text-gray-600 mb-3">이 기기에 앱으로 설치하면 주소창 없이 전체 화면으로 열려요.</p>
          <button
            onClick={async () => {
              await promptInstall();
              setMode(detect());
            }}
            className="btn-primary px-6"
          >
            앱으로 설치
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-600 mb-3">아이패드·아이폰에서는 이렇게 추가해요.</p>
          <AppleSteps />
          {mode === "other" && (
            <p className="text-xs text-gray-400 mt-3">
              안드로이드·PC는 크롬 주소창 오른쪽의 설치 아이콘이나 메뉴의 <b>앱 설치</b>를 눌러요.
            </p>
          )}
        </>
      )}
    </div>
  );
}
