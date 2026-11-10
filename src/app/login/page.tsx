"use client";

import { useState, useEffect } from "react";
import { useAuth, isLegacyStudent } from "@/lib/auth-context";
import { requestPasswordReset } from "@/lib/api";
import { TERMS_VERSION } from "@/lib/legal";
import ConsentChecklist, { ConsentItem, ParentPrivacySummary } from "@/components/ConsentChecklist";
import LegalFooter from "@/components/LegalFooter";
import { BookOpen } from "lucide-react";

type Mode = "login" | "signup" | "forgot";

const SIGNUP_CONSENTS: ConsentItem[] = [
  { key: "age", label: "만 14세 이상입니다" },
  { key: "terms", label: "이용약관 동의", href: "/terms" },
  { key: "privacy", label: "개인정보 수집·이용 동의", href: "/privacy", detail: <ParentPrivacySummary /> },
];

// 학부모 로그인·회원가입·비밀번호 찾기. 아이는 따로 로그인하지 않고, 부모가 로그인한 기기에서 프로필을 고른다.
export default function LoginPage() {
  const { signIn, signUp, user, profile, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    // 개편 전 학생 계정 세션이면 이 화면에 남아 부모 계정으로 로그인하게 한다
    if (isLegacyStudent(user, profile)) return;
    window.location.replace("/");
  }, [user, profile, authLoading]);

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [consents, setConsents] = useState<Record<string, boolean>>({});

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<"signup" | "reset" | null>(null);

  // ?deleted=1 (회원 탈퇴 직후) / ?mode=forgot (재설정 링크 만료 후 다시 요청)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("deleted") === "1") setNotice("탈퇴가 완료됐어요. 그동안 이용해주셔서 감사합니다.");
    if (params.get("mode") === "forgot") setMode("forgot");
  }, []);

  const allAgreed = SIGNUP_CONSENTS.every((c) => consents[c.key]);

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
    setNotice("");
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (mode === "login") {
      const result = await signIn(email, password);
      if (result.error) {
        setError(
          /invalid/i.test(result.error)
            ? "이메일 또는 비밀번호가 올바르지 않아요"
            : /not confirmed/i.test(result.error)
              ? "이메일 인증이 아직 안 됐어요. 가입할 때 받은 메일의 링크를 눌러주세요."
              : result.error
        );
        setLoading(false);
      } else {
        window.location.replace("/");
      }
      return;
    }

    if (mode === "forgot") {
      const result = await requestPasswordReset(email);
      setLoading(false);
      if (result.error) setError(result.error);
      else setDone("reset");
      return;
    }

    if (!name.trim()) {
      setError("이름을 입력해주세요");
      setLoading(false);
      return;
    }
    if (!allAgreed) {
      setError("필수 항목에 모두 동의해주세요");
      setLoading(false);
      return;
    }
    const result = await signUp(email, password, name.trim(), TERMS_VERSION);
    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else if (!result.needsConfirmation) {
      // 이메일 인증을 끈 환경: 바로 로그인된 상태
      window.location.replace("/");
    } else {
      setDone("signup");
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-purple-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">📧</div>
          <h2 className="text-2xl font-bold mb-2">이메일을 확인해주세요!</h2>
          {done === "signup" ? (
            <p className="text-gray-600 mb-6">
              {email}로 인증 메일을 보냈어요.
              <br />
              메일의 링크를 클릭하면 가입이 완료됩니다.
            </p>
          ) : (
            <p className="text-gray-600 mb-6">
              {email}로 가입된 계정이 있으면 비밀번호 재설정 메일을 보냈어요.
              <br />
              메일의 링크를 눌러 새 비밀번호를 정해주세요.
              <br />
              <span className="text-sm text-gray-400">메일이 안 보이면 스팸함도 확인해주세요.</span>
            </p>
          )}
          <button
            onClick={() => {
              setDone(null);
              switchMode("login");
            }}
            className="btn-kid bg-kid-blue"
          >
            로그인하기
          </button>
        </div>
      </div>
    );
  }

  const title = mode === "signup" ? "회원가입" : mode === "forgot" ? "비밀번호 찾기" : "로그인";

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-purple-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-lg p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-3">
            <BookOpen className="w-12 h-12 text-kid-blue" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">영어 단어 학습</h1>
          <p className="text-sm text-gray-500 mt-2">
            {mode === "forgot"
              ? "가입한 이메일을 입력하면 비밀번호를 다시 정하는 링크를 보내드려요"
              : "부모님 계정으로 로그인한 뒤, 아이 이름을 골라 공부를 시작해요"}
          </p>
        </div>

        {notice && <div className="bg-green-50 text-green-700 px-4 py-3 rounded-xl text-sm mb-4">{notice}</div>}

        <form onSubmit={handleSubmit} className="space-y-4" aria-label={title}>
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

          {mode !== "forgot" && (
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
          )}

          {mode === "signup" && (
            <ConsentChecklist items={SIGNUP_CONSENTS} checked={consents} onChange={setConsents} />
          )}

          {error && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>}

          <button
            type="submit"
            disabled={loading || (mode === "signup" && !allAgreed)}
            className="w-full btn-kid bg-kid-blue disabled:opacity-50"
          >
            {loading
              ? "처리 중..."
              : mode === "login"
                ? "로그인"
                : mode === "signup"
                  ? "동의하고 가입하기"
                  : "재설정 메일 보내기"}
          </button>
        </form>

        <div className="text-center mt-6 space-y-2">
          {mode === "login" && (
            <>
              <p className="text-gray-500">
                계정이 없으신가요?{" "}
                <button onClick={() => switchMode("signup")} className="text-kid-blue font-bold hover:underline">
                  회원가입
                </button>
              </p>
              <button onClick={() => switchMode("forgot")} className="text-sm text-gray-400 hover:text-gray-600 hover:underline">
                비밀번호를 잊으셨나요?
              </button>
            </>
          )}
          {mode === "signup" && (
            <>
              <p className="text-gray-500">
                이미 계정이 있으신가요?{" "}
                <button onClick={() => switchMode("login")} className="text-kid-blue font-bold hover:underline">
                  로그인
                </button>
              </p>
              <p className="text-xs text-gray-400">
                가입 후 부모 화면에서 자녀를 추가할 수 있어요 (아이는 따로 가입하지 않아요)
              </p>
            </>
          )}
          {mode === "forgot" && (
            <button onClick={() => switchMode("login")} className="text-kid-blue font-bold hover:underline">
              로그인으로 돌아가기
            </button>
          )}
        </div>
      </div>
      <LegalFooter className="mt-6 max-w-md" />
    </div>
  );
}
