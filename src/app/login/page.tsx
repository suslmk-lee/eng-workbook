"use client";

import { useState, useEffect } from "react";
import { useAuth, isLegacyStudent } from "@/lib/auth-context";
import { BookOpen } from "lucide-react";

// 학부모 로그인·회원가입. 아이는 따로 로그인하지 않고, 부모가 로그인한 기기에서 프로필을 고른다.
export default function LoginPage() {
  const { signIn, signUp, user, profile, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    // 개편 전 학생 계정 세션이면 이 화면에 남아 부모 계정으로 로그인하게 한다
    if (isLegacyStudent(user, profile)) return;
    window.location.replace("/");
  }, [user, profile, authLoading]);

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);

  const handleParentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (mode === "login") {
      const result = await signIn(email, password);
      if (result.error) {
        setError(
          /invalid/i.test(result.error)
            ? "이메일 또는 비밀번호가 올바르지 않아요"
            : result.error
        );
        setLoading(false);
      } else {
        window.location.replace("/");
      }
    } else {
      if (!name.trim()) {
        setError("이름을 입력해주세요");
        setLoading(false);
        return;
      }
      const result = await signUp(email, password, name, "parent");
      if (result.error) {
        setError(result.error);
        setLoading(false);
      } else {
        setSignupSuccess(true);
        setLoading(false);
      }
    }
  };

  if (signupSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-purple-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">📧</div>
          <h2 className="text-2xl font-bold mb-2">이메일을 확인해주세요!</h2>
          <p className="text-gray-600 mb-6">
            {email}로 인증 메일을 보냈어요.<br />
            메일의 링크를 클릭하면 가입이 완료됩니다.
          </p>
          <button
            onClick={() => { setSignupSuccess(false); setMode("login"); }}
            className="btn-kid bg-kid-blue"
          >
            로그인하기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-purple-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-lg p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-3">
            <BookOpen className="w-12 h-12 text-kid-blue" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">영어 단어 학습</h1>
          <p className="text-sm text-gray-500 mt-2">
            부모님 계정으로 로그인한 뒤, 아이 이름을 골라 공부를 시작해요
          </p>
        </div>

        <>
            <form onSubmit={handleParentSubmit} className="space-y-4">
              {mode === "signup" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="이름을 입력하세요"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-kid-blue focus:outline-none text-lg"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-kid-blue focus:outline-none text-lg"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="6자 이상"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-kid-blue focus:outline-none text-lg"
                  required
                  minLength={6}
                />
              </div>

              {error && (
                <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full btn-kid bg-kid-blue disabled:opacity-50"
              >
                {loading ? "처리 중..." : mode === "login" ? "로그인" : "회원가입"}
              </button>
            </form>

            <div className="text-center mt-6">
              {mode === "login" ? (
                <p className="text-gray-500">
                  계정이 없으신가요?{" "}
                  <button
                    onClick={() => { setMode("signup"); setError(""); }}
                    className="text-kid-blue font-bold hover:underline"
                  >
                    회원가입
                  </button>
                </p>
              ) : (
                <>
                  <p className="text-gray-500">
                    이미 계정이 있으신가요?{" "}
                    <button
                      onClick={() => { setMode("login"); setError(""); }}
                      className="text-kid-blue font-bold hover:underline"
                    >
                      로그인
                    </button>
                  </p>
                  <p className="text-xs text-gray-400 mt-2">
                    가입 후 부모 화면에서 자녀를 추가할 수 있어요 (아이는 따로 가입하지 않아요)
                  </p>
                </>
              )}
            </div>
        </>
      </div>
    </div>
  );
}
