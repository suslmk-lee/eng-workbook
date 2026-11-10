"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { deleteMyAccount, getGuardianCount, verifyPassword } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

// 회원 탈퇴 확인 창. 비밀번호를 다시 확인한 뒤 계정과 (다른 보호자가 없으면) 가족 데이터를 모두 삭제한다.
export default function DeleteAccountDialog({
  email,
  childNames,
  onCancel,
}: {
  email: string;
  childNames: string[];
  onCancel: () => void;
}) {
  const { signOut } = useAuth();
  const [guardians, setGuardians] = useState<number | null>(null);
  const [password, setPassword] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getGuardianCount().then(setGuardians);
  }, []);

  const sharedFamily = (guardians ?? 1) > 1;

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    if (!(await verifyPassword(email, password))) {
      setError("비밀번호가 맞지 않아요.");
      setBusy(false);
      return;
    }
    if (!(await deleteMyAccount())) {
      setError("탈퇴하지 못했어요. 잠시 후 다시 시도해주세요. 계속 안 되면 고객 문의로 알려주세요.");
      setBusy(false);
      return;
    }
    // 계정이 이미 지워졌으므로 서버 로그아웃이 실패해도 이 기기의 로그인 정보는 직접 지운다
    try {
      await signOut();
    } catch {}
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("sb-") && k.endsWith("-auth-token"))
        .forEach((k) => localStorage.removeItem(k));
    } catch {}
    window.location.replace("/login?deleted=1");
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="회원 탈퇴">
      <form onSubmit={handleDelete} className="bg-white rounded-3xl shadow-xl p-6 max-w-md w-full space-y-4">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <AlertTriangle className="w-6 h-6 text-red-500" />
          회원 탈퇴
        </h2>

        {guardians === null ? (
          <p className="text-gray-500 text-sm">확인 중이에요...</p>
        ) : sharedFamily ? (
          <div className="text-sm text-gray-600 space-y-2">
            <p>가족을 함께 관리하는 다른 보호자가 있어요.</p>
            <p>
              <b>내 계정({email})만 삭제</b>되고, 자녀 프로필과 학습 기록은 다른 보호자를 위해 그대로 남아요. 내가 등록한
              단어 숙제는 다른 보호자 이름으로 옮겨져요.
            </p>
          </div>
        ) : (
          <div className="text-sm text-gray-600 space-y-2">
            <p>탈퇴하면 아래 정보가 바로 모두 삭제되고 되돌릴 수 없어요.</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>내 계정 ({email})</li>
              <li>
                자녀 프로필
                {childNames.length > 0 ? ` ${childNames.length}명 (${childNames.join(", ")})` : " (없음)"}
              </li>
              <li>단어 숙제, 학습 기록, 보상, 단어별 복습 일정</li>
              <li>부모 PIN</li>
            </ul>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="delete-password">
            비밀번호 확인
          </label>
          <input
            id="delete-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="input-field w-full"
            required
          />
        </div>

        <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={understood}
            onChange={(e) => setUnderstood(e.target.checked)}
            className="w-4 h-4 mt-0.5 accent-red-500"
          />
          삭제된 정보는 되돌릴 수 없다는 것을 확인했어요
        </label>

        {error && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>}

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onCancel} disabled={busy} className="px-5 py-2 rounded-xl bg-gray-100 text-gray-700 font-medium">
            취소
          </button>
          <button
            type="submit"
            disabled={busy || !understood || !password || guardians === null}
            className="px-5 py-2 rounded-xl bg-red-500 text-white font-bold disabled:opacity-50"
          >
            {busy ? "삭제 중..." : "탈퇴하기"}
          </button>
        </div>
      </form>
    </div>
  );
}
