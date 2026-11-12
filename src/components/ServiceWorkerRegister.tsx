"use client";

import { useEffect } from "react";
import { listenForInstallPrompt } from "@/lib/install-app";

// 앱 시작 시 한 번: 홈 화면 앱 설치 신호 받기 + 오프라인 안내용 서비스 워커 등록
// (서비스 워커는 운영 빌드에서만. 개발 중에는 캐시가 헷갈리지 않게 등록하지 않음)
export default function ServiceWorkerRegister() {
  useEffect(() => {
    listenForInstallPrompt();
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
