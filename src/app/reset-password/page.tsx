"use client";

import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { changePassword } from "@/lib/api";

type Status = "checking" | "ready" | "invalid" | "signed-in" | "done";

// 페이지 코드가 처음 실행될 때의 주소. supabase-js는 링크를 처리한 뒤(네트워크 확인 후) # 부분을 지우므로
// 그 전에 읽어 둔다. 재설정 링크면 type=recovery, 만료·재사용 링크면 error가 붙어 온다.
const INITIAL_PARAMS =
  typeof window === "undefined"
    ? new URLSearchParams()
    : new URLSearchParams(`${window.location.hash.slice(1)}&${window.location.search.slice(1)}`);

// 비밀번호 재설정 메일의 링크로 들어오는 화면.
// 링크를 누르면 Supabase가 이 주소로 돌려보내며 주소 뒤(#)에 임시 로그인 정보를 붙이고,
// supabase-js가 이를 읽어 로그인 상태로 만든다. 그 상태에서 새 비밀번호를 정한다.
// 메일 링크 없이 들어오면(이미 로그인된 기기에서 주소만 입력) 비밀번호를 바꿀 수 없다.
// 부모 PIN을 거치지 않고 아이가 비밀번호를 바꾸는 일을 막기 위해서다.
export default function ResetPasswordPage() {
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (INITIAL_PARAMS.get("error") || INITIAL_PARAMS.get("error_code")) {
      setStatus("invalid");
      return;
    }
    const fromRecoveryLink = INITIAL_PARAMS.get("type") === "recovery";

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (mounted && event === "PASSWORD_RECOVERY") setStatus("ready");
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setStatus((s) => {
        if (s !== "checking") return s;
        if (!session) return "invalid";
        return fromRecoveryLink ? "ready" : "signed-in";
      });
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("비밀번호는 6자 이상이어야 해요.");
      return;
    }
    if (password !== confirm) {
      setError("두 비밀번호가 서로 달라요.");
      return;
    }
    setSaving(true);
    const result = await changePassword(password);
    setSaving(false);
    if (result.error) setError(result.error);
    else setStatus("done");
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-purple-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-lg p-8 max-w-md w-full">
        <div className="flex justify-center mb-3">
          <KeyRound className="w-12 h-12 text-kid-blue" />
        </div>
        <h1 className="text-2xl font-bold text-gray-800 text-center mb-6">새 비밀번호 정하기</h1>

        {status === "checking" && <p className="text-center text-gray-500">확인 중이에요...</p>}

        {status === "invalid" && (
          <div className="text-center space-y-4">
            <p className="text-gray-600">
              링크가 만료되었거나 이미 사용한 링크예요.
              <br />
              비밀번호 찾기를 다시 해주세요.
            </p>
            <a href="/login?mode=forgot" className="btn-kid bg-kid-blue inline-block">
              비밀번호 찾기
            </a>
          </div>
        )}

        {status === "signed-in" && (
          <div className="text-center space-y-4">
            <p className="text-gray-600">
              이미 로그인되어 있어요.
              <br />
              비밀번호는 부모 화면 &gt; 내 계정에서 바꿀 수 있어요.
            </p>
            <a href="/" className="btn-kid bg-kid-blue inline-block">
              처음으로
            </a>
          </div>
        )}

        {status === "ready" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="new-password">
                새 비밀번호
              </label>
              <input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="6자 이상"
                autoComplete="new-password"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-kid-blue focus:outline-none text-lg"
                required
                minLength={6}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="confirm-password">
                새 비밀번호 확인
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-kid-blue focus:outline-none text-lg"
                required
                minLength={6}
              />
            </div>
            {error && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>}
            <button type="submit" disabled={saving} className="w-full btn-kid bg-kid-blue disabled:opacity-50">
              {saving ? "저장 중..." : "비밀번호 바꾸기"}
            </button>
          </form>
        )}

        {status === "done" && (
          <div className="text-center space-y-4">
            <p className="text-gray-600">비밀번호를 바꿨어요. 이제 새 비밀번호로 로그인할 수 있어요.</p>
            <a href="/" className="btn-kid bg-kid-blue inline-block">
              시작하기
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
