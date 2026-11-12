// 서비스 워커: 인터넷이 끊겼을 때 흰 화면 대신 안내 화면을 보여준다.
// 앱 화면·데이터는 캐시하지 않는다 (항상 서버의 최신 버전, 배포 후 옛 화면이 남는 문제 없음).
// 안내 화면을 바꾸면 CACHE 이름의 숫자를 올린다.
const CACHE = "ew-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" }))));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  // 화면 이동(페이지 열기)만 다룬다. API·이미지·스크립트 요청은 손대지 않음
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
});
