"use client";

// 자녀 모드 상태 (기기에만 저장)
//  - 활성 자녀: 이 기기에서 지금 공부 중인 자녀 프로필 (localStorage, 앱을 다시 열어도 유지)
//  - 부모 화면 잠금 해제: 부모 PIN을 확인한 탭에서만 유효 (sessionStorage, 탭을 닫으면 다시 잠김)
// 두 값 모두 로그인한 학부모 계정 id와 묶어서, 다른 계정으로 로그인하면 무시된다.
//
// 부모 PIN은 아이가 부모 화면(단어 등록·자녀 관리·결제 등)에 실수로 들어가지 않게 하는 잠금이다.
// 자녀 모드도 부모 계정의 세션으로 동작하므로 보안 경계는 아니고, 데이터 권한은 DB RLS가 지킨다.

import { createContext, useContext } from "react";

export interface ActiveChild {
  id: string;
  name: string;
}

const ACTIVE_CHILD_KEY = "ew_active_child_v1";
const PARENT_UNLOCK_KEY = "ew_parent_unlocked_v1";

export function getActiveChild(userId: string): ActiveChild | null {
  try {
    const raw = localStorage.getItem(ACTIVE_CHILD_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { userId?: string; id?: string; name?: string };
    if (saved.userId !== userId || !saved.id) return null;
    return { id: saved.id, name: saved.name ?? "" };
  } catch {
    return null;
  }
}

export function setActiveChild(userId: string, child: ActiveChild | null): void {
  try {
    if (child) localStorage.setItem(ACTIVE_CHILD_KEY, JSON.stringify({ userId, ...child }));
    else localStorage.removeItem(ACTIVE_CHILD_KEY);
  } catch {}
}

export function isParentUnlocked(userId: string): boolean {
  try {
    return sessionStorage.getItem(PARENT_UNLOCK_KEY) === userId;
  } catch {
    return false;
  }
}

export function setParentUnlocked(userId: string, unlocked: boolean): void {
  try {
    if (unlocked) sessionStorage.setItem(PARENT_UNLOCK_KEY, userId);
    else sessionStorage.removeItem(PARENT_UNLOCK_KEY);
  } catch {}
}

// 자녀 모드 시작: 이 아이로 전환하고 부모 화면은 다시 잠근다
export function enterChildMode(userId: string, child: ActiveChild): void {
  setActiveChild(userId, child);
  setParentUnlocked(userId, false);
}

export function clearChildModeState(): void {
  try {
    localStorage.removeItem(ACTIVE_CHILD_KEY);
    sessionStorage.removeItem(PARENT_UNLOCK_KEY);
  } catch {}
}

// 학생 화면(/student/*)에서만 쓰는 현재 자녀. src/app/student/layout.tsx가 제공한다.
const ActiveChildContext = createContext<ActiveChild | null>(null);

export const ActiveChildProvider = ActiveChildContext.Provider;

export function useActiveChild(): ActiveChild {
  const child = useContext(ActiveChildContext);
  if (!child) throw new Error("useActiveChild는 학생 화면(student/layout) 안에서만 쓸 수 있어요");
  return child;
}
