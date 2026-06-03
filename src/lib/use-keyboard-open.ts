"use client";

import { useEffect, useState } from "react";

// 모바일/태블릿 화상 키보드 감지 훅.
// 키보드가 열리면 visualViewport 높이가 기준 창 높이보다 크게 줄어드는 것을 이용한다.
// (iOS는 레이아웃 뷰포트가 그대로라 window.innerHeight 비교로는 감지되지 않음)
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    let baseHeight = window.innerHeight;

    const onResize = () => {
      setOpen(baseHeight - vv.height > 150);
    };
    const onOrientation = () => {
      // 회전 직후 높이가 안정된 뒤 기준 높이 갱신
      setTimeout(() => {
        baseHeight = window.innerHeight;
        onResize();
      }, 300);
    };

    vv.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onOrientation);
    onResize();
    return () => {
      vv.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onOrientation);
    };
  }, []);

  return open;
}
