import Link from "next/link";
import { LEGAL, operatorName } from "@/lib/legal";

// 사이트 하단: 이용약관·개인정보 처리방침 링크 + 사업자 정보(채워진 칸만)
export default function LegalFooter({ className = "" }: { className?: string }) {
  const info = [
    LEGAL.companyName && `상호 ${LEGAL.companyName}`,
    LEGAL.ceoName && `대표 ${LEGAL.ceoName}`,
    LEGAL.businessNumber && `사업자등록번호 ${LEGAL.businessNumber}`,
    LEGAL.mailOrderNumber && `통신판매업 신고 ${LEGAL.mailOrderNumber}`,
    LEGAL.address && LEGAL.address,
    LEGAL.email && `문의 ${LEGAL.email}`,
    LEGAL.phone && LEGAL.phone,
  ].filter(Boolean) as string[];

  return (
    <footer className={`text-xs text-gray-400 text-center space-y-1 ${className}`}>
      <nav className="flex justify-center gap-3">
        <Link href="/terms" className="hover:text-gray-600 hover:underline">
          이용약관
        </Link>
        <span aria-hidden>·</span>
        <Link href="/privacy" className="font-bold text-gray-500 hover:text-gray-700 hover:underline">
          개인정보 처리방침
        </Link>
      </nav>
      {info.length > 0 && <p className="leading-relaxed">{info.join(" | ")}</p>}
      <p>© {operatorName()}</p>
    </footer>
  );
}
