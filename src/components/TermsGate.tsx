"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Child } from "@/lib/types";
import { agreeTerms } from "@/lib/api";
import { LEGAL, TERMS_VERSION } from "@/lib/legal";
import ConsentChecklist, { ChildPrivacySummary, ConsentItem, ParentPrivacySummary } from "./ConsentChecklist";
import DeleteAccountDialog from "./DeleteAccountDialog";
import LegalFooter from "./LegalFooter";

// 약관에 아직 동의하지 않았거나(기존 회원·약관 변경), 동의 기록이 없는 자녀가 있을 때 부모 화면 대신 보여준다.
export function needsConsent(termsVersion: string | null | undefined, children: Child[]): boolean {
  if (termsVersion === undefined) return false; // 조회 실패 시 막지 않음
  return termsVersion !== TERMS_VERSION || children.some((c) => !c.guardian_consent_at);
}

export default function TermsGate({
  termsVersion,
  email,
  childList,
  onAgreed,
  onSignOut,
}: {
  termsVersion: string | null;
  email: string;
  childList: Child[];
  onAgreed: () => void;
  onSignOut: () => void;
}) {
  const unconsented = childList.filter((c) => !c.guardian_consent_at);
  const termsOutdated = termsVersion !== TERMS_VERSION;

  const items: ConsentItem[] = [];
  if (termsOutdated) {
    items.push(
      { key: "age", label: "만 14세 이상입니다" },
      { key: "terms", label: "이용약관 동의", href: "/terms" },
      { key: "privacy", label: "개인정보 수집·이용 동의", href: "/privacy", detail: <ParentPrivacySummary /> }
    );
  }
  if (unconsented.length > 0) {
    items.push({
      key: "children",
      label: `자녀(${unconsented.map((c) => c.name).join(", ")})의 법정대리인으로서 자녀 개인정보 수집·이용에 동의`,
      detail: <ChildPrivacySummary />,
    });
  }

  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const allChecked = items.every((i) => checked[i.key]);

  async function handleAgree() {
    setBusy(true);
    setError("");
    if (await agreeTerms(TERMS_VERSION, unconsented.length > 0)) {
      onAgreed();
    } else {
      setError("저장하지 못했어요. 다시 시도해주세요.");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-purple-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-lg p-8 max-w-md w-full space-y-4">
        <div className="flex justify-center">
          <ShieldCheck className="w-12 h-12 text-kid-blue" />
        </div>
        <h1 className="text-2xl font-bold text-gray-800 text-center">동의가 필요해요</h1>
        <p className="text-sm text-gray-600 text-center">
          {termsOutdated
            ? `${LEGAL.serviceName}의 이용약관과 개인정보 처리방침이 새로 생기거나 바뀌었어요. 계속 이용하시려면 아래 내용에 동의해주세요.`
            : "아이 정보를 안전하게 다루기 위해 보호자 동의를 받고 있어요."}
          {unconsented.length > 0 && " 동의 전에는 아이가 공부를 시작할 수 없어요."}
        </p>

        <ConsentChecklist items={items} checked={checked} onChange={setChecked} />

        {error && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>}

        <button
          onClick={handleAgree}
          disabled={!allChecked || busy}
          className="w-full btn-kid bg-kid-blue disabled:opacity-50"
        >
          {busy ? "저장 중..." : "동의하고 계속하기"}
        </button>

        <div className="text-center text-xs text-gray-400 space-y-1 pt-2">
          <p>동의하지 않으시면 서비스를 이용할 수 없어요.</p>
          <div className="flex justify-center gap-3">
            <button onClick={onSignOut} className="hover:text-gray-600 underline">
              로그아웃
            </button>
            <button onClick={() => setDeleting(true)} className="hover:text-red-500 underline">
              회원 탈퇴
            </button>
          </div>
        </div>
      </div>
      <LegalFooter className="mt-6 max-w-md" />

      {deleting && (
        <DeleteAccountDialog email={email} childNames={childList.map((c) => c.name)} onCancel={() => setDeleting(false)} />
      )}
    </div>
  );
}
