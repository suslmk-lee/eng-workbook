"use client";

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { Child } from "@/lib/types";
import { getChildren, hasParentPin } from "@/lib/api";
import { useAuth, isLegacyStudent } from "@/lib/auth-context";
import { enterChildMode, setParentUnlocked } from "@/lib/child-mode";
import ParentPinDialog from "@/components/ParentPinDialog";
import LegacyStudentNotice from "@/components/LegacyStudentNotice";

const AVATAR_COLORS = [
  "from-blue-400 to-indigo-500",
  "from-pink-400 to-rose-500",
  "from-green-400 to-emerald-500",
  "from-yellow-400 to-orange-500",
  "from-purple-400 to-fuchsia-500",
];

// "누가 공부하나요?" — 로그인 후 첫 화면. 자녀를 고르면 자녀 모드, 부모 메뉴는 PIN 확인
export default function ProfilesPage() {
  const { user, profile, loading } = useAuth();
  const legacy = isLegacyStudent(user, profile);
  const [kids, setKids] = useState<Child[] | null>(null);
  const [hasPin, setHasPin] = useState(false);
  // 열려 있는 PIN 창: 부모 메뉴 잠금 해제 / 자녀 모드 시작 전 PIN 정하기
  const [dialog, setDialog] = useState<{ kind: "unlock" } | { kind: "setup"; child: Child } | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      window.location.replace("/login");
      return;
    }
    if (legacy) return;
    (async () => {
      const [children, pin] = await Promise.all([getChildren(), hasParentPin()]);
      // 처음 가입한 학부모(자녀·PIN 없음)는 바로 부모 화면에서 자녀부터 추가
      if (children.length === 0 && !pin) {
        window.location.replace("/parent");
        return;
      }
      setKids(children);
      setHasPin(pin);
    })();
  }, [loading, user, legacy]);

  if (legacy) return <LegacyStudentNotice />;
  if (!user || !kids) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-4xl animate-bounce-slow">📚</div>
      </div>
    );
  }

  function startChild(child: Child) {
    if (!user) return;
    enterChildMode(user.id, { id: child.id, name: child.name });
    window.location.assign("/student");
  }

  function openParentMenu() {
    if (!user) return;
    if (!hasPin) {
      window.location.assign("/parent");
      return;
    }
    setDialog({ kind: "unlock" });
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <h1 className="text-3xl font-extrabold text-gray-800 mb-2">누가 공부하나요?</h1>
      <p className="text-gray-500 mb-10">내 이름을 눌러요</p>

      {kids.length === 0 ? (
        <p className="text-gray-400 mb-10 text-center">
          아직 자녀가 없어요.
          <br />
          부모 메뉴에서 자녀를 추가해주세요.
        </p>
      ) : (
        <div className="flex flex-wrap justify-center gap-6 mb-12 max-w-2xl">
          {kids.map((child, i) => (
            <button
              key={child.id}
              onClick={() => (hasPin ? startChild(child) : setDialog({ kind: "setup", child }))}
              className="flex flex-col items-center gap-3 group"
            >
              <div
                className={`w-28 h-28 rounded-3xl bg-gradient-to-br ${
                  AVATAR_COLORS[i % AVATAR_COLORS.length]
                } flex items-center justify-center text-5xl font-extrabold text-white shadow-lg group-hover:scale-105 group-active:scale-95 transition-transform`}
              >
                {child.name.slice(0, 1)}
              </div>
              <span className="text-lg font-bold text-gray-700">{child.name}</span>
            </button>
          ))}
        </div>
      )}

      <button
        onClick={openParentMenu}
        className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white shadow-md text-gray-600 font-medium hover:bg-gray-50"
      >
        <Lock className="w-4 h-4" />
        부모 메뉴
      </button>

      {dialog?.kind === "unlock" && (
        <ParentPinDialog
          mode="unlock"
          onCancel={() => setDialog(null)}
          onDone={() => {
            setParentUnlocked(user.id, true);
            window.location.assign("/parent");
          }}
        />
      )}

      {dialog?.kind === "setup" && (
        <ParentPinDialog
          mode="setup"
          onCancel={() => setDialog(null)}
          onDone={() => startChild(dialog.child)}
        />
      )}
    </div>
  );
}
