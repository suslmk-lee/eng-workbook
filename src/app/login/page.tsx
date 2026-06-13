"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { BookOpen, Users, GraduationCap } from "lucide-react";
import { studentEmail, derivePassword, isValidLoginId, isValidPin } from "@/lib/pin-auth";

export default function LoginPage() {
  const { signIn, signUp, user, profile, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    const role = profile?.role ?? (user.user_metadata?.role as string | undefined);
    if (role === "parent") window.location.replace("/parent");
    else if (role === "student") window.location.replace("/student");
    else window.location.replace("/");
  }, [user, profile, authLoading]);

  const [tab, setTab] = useState<"student" | "parent">("student");
  const [mode, setMode] = useState<"login" | "signup">("login");

  // 학생 (아이디 + PIN)
  const [loginId, setLoginId] = useState("");
  const [pin, setPin] = useState("");

  // 학부모 (이메일 + 비밀번호)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);

  function switchTab(next: "student" | "parent") {
    setTab(next);
    setMode("login");
    setError("");
  }

  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const id = loginId.trim().toLowerCase();
    if (!isValidLoginId(id)) {
      setError("아이디는 영문 소문자와 숫자로 3~12자예요");
      return;
    }
    if (!isValidPin(pin)) {
      setError("PIN은 숫자 4자리예요");
      return;
    }

    setLoading(true);
    const result = await signIn(studentEmail(id), derivePassword(id, pin));
    if (result.error) {
      setError("아이디 또는 PIN이 맞지 않아요");
      setLoading(false);
    } else {
      window.location.replace("/student");
    }
  };

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
        </div>

        {/* 학생 / 학부모 탭 */}
        <div className="flex gap-3 mb-6">
          <button
            type="button"
            onClick={() => switchTab("student")}
            className={`flex-1 p-4 rounded-2xl border-2 transition-all ${
              tab === "student"
                ? "border-kid-green bg-green-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <GraduationCap className={`w-8 h-8 mx-auto mb-2 ${tab === "student" ? "text-kid-green" : "text-gray-400"}`} />
            <p className={`font-bold text-sm ${tab === "student" ? "text-kid-green" : "text-gray-500"}`}>학생</p>
          </button>
          <button
            type="button"
            onClick={() => switchTab("parent")}
            className={`flex-1 p-4 rounded-2xl border-2 transition-all ${
              tab === "parent"
                ? "border-kid-blue bg-blue-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <Users className={`w-8 h-8 mx-auto mb-2 ${tab === "parent" ? "text-kid-blue" : "text-gray-400"}`} />
            <p className={`font-bold text-sm ${tab === "parent" ? "text-kid-blue" : "text-gray-500"}`}>학부모</p>
          </button>
        </div>

        {tab === "student" ? (
          <form onSubmit={handleStudentSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">아이디</label>
              <input
                type="text"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))}
                placeholder="내 아이디"
                maxLength={12}
                autoCapitalize="none"
                autoCorrect="off"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-kid-green focus:outline-none text-lg text-center"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PIN (숫자 4자리)</label>
              <input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="••••"
                maxLength={4}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-kid-green focus:outline-none text-2xl text-center tracking-[0.5em]"
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-kid bg-kid-green disabled:opacity-50"
            >
              {loading ? "처리 중..." : "들어가기"}
            </button>

            <p className="text-center text-sm text-gray-400">
              아이디와 PIN은 부모님이 알려주세요
            </p>
          </form>
        ) : (
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
                    학생(자녀) 계정은 가입 후 학부모 페이지에서 만들 수 있어요
                  </p>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
