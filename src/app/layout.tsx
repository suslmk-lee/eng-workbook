import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "영어 단어 학습",
  description: "매일 영어 단어를 재미있게 외우자!",
  applicationName: "영어 단어 학습",
  // 아이폰·아이패드 홈 화면에 추가했을 때: 주소창 없이 전체 화면, 아이콘 아래 이름
  appleWebApp: { capable: true, title: "영어 단어", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#eff6ff",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="antialiased">
        <AuthProvider>{children}</AuthProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
