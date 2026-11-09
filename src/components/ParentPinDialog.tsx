"use client";

import { useState } from "react";
import PinPad from "./PinPad";
import { setParentPin, verifyParentPin } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";

// 부모 PIN 관련 흐름을 한 곳에서 처리
//  - setup:  새 PIN → 확인
//  - change: 현재 PIN → 새 PIN → 확인
//  - unlock: PIN 입력 (잊었으면 계정 비밀번호로 다시 로그인 → 새 PIN → 확인)
type Mode = "setup" | "change" | "unlock";
type Step = "verify" | "current" | "password" | "new" | "confirm";

export default function ParentPinDialog({
  mode,
  onDone,
  onCancel,
}: {
  mode: Mode;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { user, signOut } = useAuth();
  const [step, setStep] = useState<Step>(
    mode === "setup" ? "new" : mode === "change" ? "current" : "verify"
  );
  const [currentPin, setCurrentPin] = useState<string | undefined>();
  const [firstPin, setFirstPin] = useState("");
  const [notice, setNotice] = useState("");

  if (step === "password") {
    return (
      <ReauthDialog
        email={user?.email ?? ""}
        onSuccess={() => {
          setCurrentPin(undefined);
          setNotice("");
          setStep("new");
        }}
        onCancel={onCancel}
        onSignOut={async () => {
          await signOut();
          window.location.replace("/login");
        }}
      />
    );
  }

  if (step === "verify") {
    return (
      <PinPad
        key="verify"
        title="부모 PIN 입력"
        description="부모님만 들어갈 수 있어요"
        onCancel={onCancel}
        onComplete={async (pin) => {
          if (await verifyParentPin(pin)) {
            onDone();
            return null;
          }
          return "PIN이 맞지 않아요";
        }}
        footer={
          <button onClick={() => setStep("password")} className="text-sm text-gray-400 underline">
            PIN을 잊었어요
          </button>
        }
      />
    );
  }

  if (step === "current") {
    return (
      <PinPad
        key="current"
        title="현재 PIN 입력"
        onCancel={onCancel}
        onComplete={async (pin) => {
          if (!(await verifyParentPin(pin))) return "현재 PIN이 맞지 않아요";
          setCurrentPin(pin);
          setStep("new");
          return null;
        }}
        footer={
          <button onClick={() => setStep("password")} className="text-sm text-gray-400 underline">
            PIN을 잊었어요
          </button>
        }
      />
    );
  }

  if (step === "new") {
    return (
      <PinPad
        key="new"
        title={mode === "setup" ? "부모 PIN 정하기" : "새 PIN 입력"}
        description={
          notice || (
            <>
              자녀 모드에서 부모 화면으로 돌아올 때 써요.
              <br />
              아이가 모르는 숫자 4자리로 정해주세요.
            </>
          )
        }
        onCancel={onCancel}
        onComplete={(pin) => {
          setFirstPin(pin);
          setNotice("");
          setStep("confirm");
          return null;
        }}
      />
    );
  }

  // confirm
  return (
    <PinPad
      key="confirm"
      title="한 번 더 입력"
      description="확인을 위해 같은 PIN을 입력해주세요"
      onCancel={onCancel}
      onComplete={async (pin) => {
        if (pin !== firstPin) {
          setNotice("두 번 입력한 PIN이 달라요. 다시 정해주세요.");
          setStep("new");
          return null;
        }
        const { error } = await setParentPin(pin, currentPin);
        if (error === "current_pin_required") {
          // 비밀번호 재확인 후 10분이 지났거나 현재 PIN이 바뀐 경우
          setNotice("시간이 지나 다시 확인이 필요해요.");
          setStep(mode === "unlock" ? "password" : "current");
          return null;
        }
        if (error) return "저장하지 못했어요. 다시 시도해주세요.";
        onDone();
        return null;
      }}
    />
  );
}

// PIN 분실: 계정 비밀번호로 다시 로그인하면 10분 안에 현재 PIN 없이 새 PIN을 정할 수 있다
function ReauthDialog({
  email,
  onSuccess,
  onCancel,
  onSignOut,
}: {
  email: string;
  onSuccess: () => void;
  onCancel: () => void;
  onSignOut: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError("비밀번호가 맞지 않아요");
      return;
    }
    onSuccess();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl p-6 w-full max-w-sm">
        <h2 className="text-lg font-bold text-gray-800 text-center">PIN 다시 정하기</h2>
        {email ? (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <p className="text-sm text-gray-500 text-center">
              계정 비밀번호를 입력하면 새 PIN을 정할 수 있어요.
              <br />
              <span className="text-gray-400">{email}</span>
            </p>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="계정 비밀번호"
              className="input-field"
              autoFocus
              required
            />
            {error && <p className="text-sm text-red-500 text-center">{error}</p>}
            <button type="submit" disabled={busy} className="btn-primary w-full disabled:opacity-50">
              {busy ? "확인 중..." : "확인"}
            </button>
          </form>
        ) : (
          <div className="mt-4 space-y-3 text-center">
            <p className="text-sm text-gray-500">
              로그아웃한 뒤 다시 로그인하면, 10분 안에 새 PIN을 정할 수 있어요.
            </p>
            <button onClick={onSignOut} className="btn-primary w-full">
              로그아웃
            </button>
          </div>
        )}
        <button onClick={onCancel} className="w-full mt-3 text-sm text-gray-400">
          취소
        </button>
      </div>
    </div>
  );
}
