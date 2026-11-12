import type { MetadataRoute } from "next";

// 홈 화면 앱(PWA) 정보: 홈 화면에 추가하면 주소창 없이 앱처럼 열린다
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "영어 단어 학습",
    short_name: "영어 단어",
    description: "매일 영어 단어를 재미있게 외우자!",
    lang: "ko",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any", // 아이패드 세로·가로 모두
    background_color: "#eff6ff",
    theme_color: "#eff6ff",
    categories: ["education", "kids"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
