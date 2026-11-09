"use client";

import { useAuth } from "@/lib/auth-context";

// 개편 전 학생 계정(아이디+PIN)으로 로그인돼 있던 기기에 보여주는 안내
export default function LegacyStudentNotice() {
  const { signOut } = useAuth();

  async function goParentLogin() {
    await signOut();
    window.location.replace("/login");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-lg p-8 max-w-md w-full text-center">
        <div className="text-5xl mb-4">👋</div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">로그인 방법이 바뀌었어요</h1>
        <p className="text-gray-600 mb-6">
          이제 부모님 계정으로 로그인한 뒤,
          <br />
          내 이름을 골라서 공부해요.
          <br />
          <span className="text-sm text-gray-400">그동안의 학습 기록은 그대로 남아 있어요.</span>
        </p>
        <button onClick={goParentLogin} className="btn-kid bg-kid-blue w-full">
          부모님 계정으로 로그인
        </button>
      </div>
    </div>
  );
}
