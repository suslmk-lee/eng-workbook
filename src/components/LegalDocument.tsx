import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LEGAL } from "@/lib/legal";
import LegalFooter from "./LegalFooter";

// 이용약관·개인정보 처리방침 공통 틀
export default function LegalDocument({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4">
          <ArrowLeft className="w-4 h-4" />
          {LEGAL.serviceName}
        </Link>
        <article
          className={[
            "bg-white rounded-3xl shadow-sm p-6 md:p-10 text-gray-700 text-[15px] leading-relaxed",
            "[&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-gray-900 [&_h2]:mt-8 [&_h2]:mb-2",
            "[&_h3]:font-bold [&_h3]:text-gray-800 [&_h3]:mt-4 [&_h3]:mb-1",
            "[&_p]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-2 [&_li]:my-1",
            "[&_table]:w-full [&_table]:text-sm [&_table]:my-3 [&_table]:border-collapse",
            "[&_th]:border [&_th]:border-gray-200 [&_th]:bg-gray-50 [&_th]:p-2 [&_th]:text-left [&_th]:align-top",
            "[&_td]:border [&_td]:border-gray-200 [&_td]:p-2 [&_td]:align-top",
          ].join(" ")}
        >
          <h1 className="text-2xl font-extrabold text-gray-900">{title}</h1>
          <p className="text-sm text-gray-500 mt-1">시행일: {LEGAL.effectiveDate}</p>
          {children}
        </article>
        <LegalFooter className="mt-8" />
      </div>
    </div>
  );
}

// 표는 최소 폭을 두고, 좁은 화면(휴대폰)에서는 옆으로 밀어서 보게 한다
export function TableScroll({ children }: { children: React.ReactNode }) {
  return (
    <>
      <p className="text-xs text-gray-400 mt-3 md:hidden">표는 옆으로 밀어서 볼 수 있어요 →</p>
      <div className="overflow-x-auto [&_table]:min-w-[42rem]">{children}</div>
    </>
  );
}
