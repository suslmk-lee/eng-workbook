// 홈 화면 앱(PWA) 설치 도우미
//  - 아이폰·아이패드: 설치 버튼이 없어서 "공유 → 홈 화면에 추가" 방법을 안내
//  - 안드로이드·PC 크롬/엣지: 브라우저가 주는 설치 신호(beforeinstallprompt)로 바로 설치 창 띄우기

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
const READY = "ew-install-ready";

// 앱이 처음 뜰 때 한 번 호출 (설치 신호는 페이지가 열리자마자 오므로 일찍 받아 둔다)
export function listenForInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // 브라우저 기본 안내 대신 부모 화면의 설치 버튼을 쓴다
    deferred = e as InstallPromptEvent;
    window.dispatchEvent(new Event(READY));
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
  });
}

export function canPromptInstall(): boolean {
  return deferred !== null;
}

export function onInstallPromptReady(cb: () => void): () => void {
  window.addEventListener(READY, cb);
  return () => window.removeEventListener(READY, cb);
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  await e.prompt();
  return (await e.userChoice).outcome === "accepted";
}

// 이미 홈 화면 앱으로 실행 중인지
export function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// 아이폰·아이패드 (아이패드는 사파리가 맥처럼 자신을 소개해서 터치 지원으로 구분)
export function isAppleMobile(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}
