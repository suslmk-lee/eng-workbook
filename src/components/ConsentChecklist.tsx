"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

export interface ConsentItem {
  key: string;
  label: string;          // "[필수]" 표시는 컴포넌트가 붙인다
  href?: string;          // 전문 보기 (새 탭)
  detail?: React.ReactNode; // 펼쳐 보는 요약
}

// 동의 항목 목록 + 전체 동의. 모든 항목이 필수
export default function ConsentChecklist({
  items,
  checked,
  onChange,
}: {
  items: ConsentItem[];
  checked: Record<string, boolean>;
  onChange: (next: Record<string, boolean>) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const all = items.every((i) => checked[i.key]);

  return (
    <div className="rounded-2xl border-2 border-gray-100 p-3 space-y-2 text-sm">
      <label className="flex items-center gap-2 font-bold text-gray-800 pb-2 border-b border-gray-100 cursor-pointer">
        <input
          type="checkbox"
          checked={all}
          onChange={(e) => onChange(Object.fromEntries(items.map((i) => [i.key, e.target.checked])))}
          className="w-5 h-5 accent-kid-blue"
        />
        모두 동의합니다
      </label>
      {items.map((item) => (
        <div key={item.key}>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 flex-1 text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={!!checked[item.key]}
                onChange={(e) => onChange({ ...checked, [item.key]: e.target.checked })}
                className="w-4 h-4 accent-kid-blue shrink-0"
              />
              <span>
                <span className="text-kid-blue font-medium">[필수]</span> {item.label}
              </span>
            </label>
            {item.detail && (
              <button
                type="button"
                onClick={() => setOpen(open === item.key ? null : item.key)}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center shrink-0"
                aria-expanded={open === item.key}
              >
                내용
                <ChevronDown className={`w-3 h-3 transition-transform ${open === item.key ? "rotate-180" : ""}`} />
              </button>
            )}
            {item.href && (
              <a
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-gray-400 hover:text-gray-600 underline shrink-0"
              >
                보기
              </a>
            )}
          </div>
          {item.detail && open === item.key && (
            <div className="mt-2 ml-6 p-3 bg-gray-50 rounded-xl text-xs text-gray-600 leading-relaxed">{item.detail}</div>
          )}
        </div>
      ))}
    </div>
  );
}

// 회원(보호자) 개인정보 수집·이용 요약 (개인정보 보호법상 알릴 사항: 목적·항목·보유 기간·거부 권리)
export function ParentPrivacySummary() {
  return (
    <ul className="space-y-1">
      <li>
        <b>항목</b> 이메일, 비밀번호, 이름
      </li>
      <li>
        <b>목적</b> 회원 식별, 로그인, 비밀번호 재설정, 문의 응대
      </li>
      <li>
        <b>보유 기간</b> 회원 탈퇴 시까지
      </li>
      <li>
        데이터는 Supabase·Vercel(미국)에 맡겨 저장·처리합니다. 자세한 내용은 개인정보 처리방침에 있어요.
      </li>
      <li>동의하지 않을 수 있지만, 동의하지 않으면 가입할 수 없어요.</li>
    </ul>
  );
}

// 자녀 개인정보 법정대리인 동의 요약
export function ChildPrivacySummary() {
  return (
    <ul className="space-y-1">
      <li>
        <b>항목</b> 자녀 이름(별명 가능), 학년, 레벨 테스트 결과, 학습 기록(정답 여부·학습 일시·보상)
      </li>
      <li>
        <b>목적</b> 수준에 맞는 학습 제공, 복습 일정 계산, 보호자에게 학습 현황 제공
      </li>
      <li>
        <b>보유 기간</b> 자녀 프로필 삭제 또는 회원 탈퇴 시까지
      </li>
      <li>아이 목소리와 사진은 저장하지 않아요.</li>
      <li>동의하지 않을 수 있지만, 동의하지 않으면 자녀 프로필을 만들 수 없어요.</li>
    </ul>
  );
}
