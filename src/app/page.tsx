"use client";

import { useEffect } from "react";
import { useAuth, isLegacyStudent } from "@/lib/auth-context";
import { getActiveChild } from "@/lib/child-mode";
import LegacyStudentNotice from "@/components/LegacyStudentNotice";

// 첫 화면 분기: 비로그인 → 로그인 / 자녀 모드 중 → 학생 화면 / 그 외 → 프로필 선택
export default function HomePage() {
  const { user, profile, loading } = useAuth();
  const legacy = isLegacyStudent(user, profile);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      window.location.replace("/login");
      return;
    }
    if (legacy) return;
    window.location.replace(getActiveChild(user.id) ? "/student" : "/profiles");
  }, [user, loading, legacy]);

  if (legacy) return <LegacyStudentNotice />;

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-4xl animate-bounce-slow">📚</div>
    </div>
  );
}
