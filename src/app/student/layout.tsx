"use client";

import { ReactNode, useEffect, useState } from "react";
import { useAuth, isLegacyStudent } from "@/lib/auth-context";
import {
  ActiveChild,
  ActiveChildProvider,
  getActiveChild,
  setActiveChild,
} from "@/lib/child-mode";
import { getChild } from "@/lib/api";
import LegacyStudentNotice from "@/components/LegacyStudentNotice";

// 학생 화면 공통: 로그인 + 자녀 모드(고른 자녀)가 있어야 들어올 수 있다.
// 하위 페이지는 useActiveChild()로 현재 자녀를 쓴다.
export default function StudentLayout({ children }: { children: ReactNode }) {
  const { user, profile, loading } = useAuth();
  const legacy = isLegacyStudent(user, profile);
  const [child, setChild] = useState<ActiveChild | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      window.location.replace("/login");
      return;
    }
    if (legacy) return;

    const saved = getActiveChild(user.id);
    if (!saved) {
      window.location.replace("/profiles");
      return;
    }
    setChild(saved);

    // 부모가 그 사이 자녀를 삭제했거나 이름을 바꿨을 수 있으니 확인
    getChild(saved.id)
      .then((fresh) => {
        if (!fresh) {
          setActiveChild(user.id, null);
          window.location.replace("/profiles");
        } else if (fresh.name !== saved.name) {
          const updated = { id: fresh.id, name: fresh.name };
          setActiveChild(user.id, updated);
          setChild(updated);
        }
      })
      .catch(() => {
        // 확인 실패(오프라인 등)는 무시하고 저장된 자녀로 계속
      });
  }, [loading, user, legacy]);

  if (legacy) return <LegacyStudentNotice />;
  if (!child) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-4xl animate-bounce-slow">📚</div>
      </div>
    );
  }
  return <ActiveChildProvider value={child}>{children}</ActiveChildProvider>;
}
