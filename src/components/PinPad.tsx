"use client";

import { useState, useEffect, ReactNode } from "react";
import { Delete, X } from "lucide-react";

// 숫자 4자리 입력 패드 (부모 PIN). 4자리를 다 누르면 onComplete를 호출한다.
// onComplete가 오류 문구를 돌려주면 표시하고 입력을 비운다.
export default function PinPad({
  title,
  description,
  onComplete,
  onCancel,
  footer,
}: {
  title: string;
  description?: ReactNode;
  onComplete: (pin: string) => Promise<string | null> | string | null;
  onCancel?: () => void;
  footer?: ReactNode;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (pin.length !== 4) return;
    let cancelled = false;
    setBusy(true);
    Promise.resolve(onComplete(pin)).then((err) => {
      if (cancelled) return;
      setBusy(false);
      if (err) {
        setError(err);
        setPin("");
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  // 실물 키보드 입력도 지원
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (busy) return;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") setPin((p) => p.slice(0, -1));
      else if (e.key === "Escape") onCancel?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function press(digit: string) {
    if (busy) return;
    setError("");
    setPin((p) => (p.length < 4 ? p + digit : p));
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl p-6 w-full max-w-xs relative">
        {onCancel && (
          <button
            onClick={onCancel}
            className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600"
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        )}
        <h2 className="text-lg font-bold text-gray-800 text-center">{title}</h2>
        {description && <p className="text-sm text-gray-500 text-center mt-1">{description}</p>}

        <div className="flex justify-center gap-3 my-5" aria-label={`${pin.length}자리 입력됨`}>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full ${i < pin.length ? "bg-primary-500" : "bg-gray-200"}`}
            />
          ))}
        </div>

        <p className="text-sm text-red-500 text-center h-5 -mt-2 mb-2">{error}</p>

        <div className="grid grid-cols-3 gap-2">
          {keys.map((k) => (
            <PadButton key={k} onClick={() => press(k)} disabled={busy}>
              {k}
            </PadButton>
          ))}
          <div />
          <PadButton onClick={() => press("0")} disabled={busy}>
            0
          </PadButton>
          <PadButton onClick={() => setPin((p) => p.slice(0, -1))} disabled={busy} label="지우기">
            <Delete className="w-6 h-6 mx-auto" />
          </PadButton>
        </div>

        {footer && <div className="mt-4 text-center">{footer}</div>}
      </div>
    </div>
  );
}

function PadButton({
  children,
  onClick,
  disabled,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="h-14 rounded-2xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-2xl font-bold text-gray-800 disabled:opacity-50"
    >
      {children}
    </button>
  );
}
