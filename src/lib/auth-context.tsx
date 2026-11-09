"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { Profile } from "./types";
import { clearChildModeState } from "./child-mode";

const PROFILE_CACHE_KEY = "ew_profile_v1";

function readCachedProfile(): Profile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

function writeCachedProfile(p: Profile | null) {
  if (typeof window === "undefined") return;
  try {
    if (p) localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(p));
    else localStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {}
}

function readStoredSession(): any {
  if (typeof window === "undefined") return null;
  try {
    const keys = Object.keys(localStorage);
    const tokenKey = keys.find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
    if (!tokenKey) return null;
    const raw = localStorage.getItem(tokenKey);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.user) return null;
    return data;
  } catch {
    return null;
  }
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, name: string, role: "parent" | "student") => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      if (!error && data) {
        setProfile(data as Profile);
        writeCachedProfile(data as Profile);
      }
    } catch {
      // 네트워크 오류 - 캐시된 프로필 유지
    }
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  useEffect(() => {
    let mounted = true;

    // Phase 1: localStorage에서 동기적으로 세션/프로필 로드 → 즉시 화면 표시
    const stored = readStoredSession();
    if (stored?.user) {
      setUser(stored.user as User);
      setSession(stored as Session);
      const cached = readCachedProfile();
      if (cached?.id === stored.user.id) {
        setProfile(cached);
      }
      setLoading(false);
    }

    // Phase 2: 백그라운드에서 Supabase로 세션 검증 + 프로필 갱신
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!mounted) return;
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        if (session?.user) {
          fetchProfile(session.user.id);
        } else {
          setProfile(null);
          writeCachedProfile(null);
        }
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });

    // 백업 안전장치: 8초 내 응답 없으면 로딩 해제
    const fallback = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 8000);

    // Phase 3: 이후 auth state 변화(로그인/로그아웃/토큰갱신) 구독
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        if (event === "INITIAL_SESSION") return; // Phase 2에서 처리됨

        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          fetchProfile(session.user.id);
        } else {
          setProfile(null);
          writeCachedProfile(null);
        }
      }
    );

    return () => {
      mounted = false;
      clearTimeout(fallback);
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (
    email: string,
    password: string,
    name: string,
    role: "parent" | "student"
  ) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, role } },
    });
    if (error) return { error: error.message };

    // 프로필은 DB 트리거(handle_new_user)가 만든다. 트리거가 없는 환경 대비로만 추가하고,
    // 이미 있으면 건드리지 않는다 (클라이언트는 role·email 수정 권한이 없음).
    if (data.user && data.session) {
      const { error: profileError } = await supabase.from("profiles").upsert(
        { id: data.user.id, email, name, role },
        { onConflict: "id", ignoreDuplicates: true }
      );
      if (profileError) {
        console.error("Profile upsert error:", profileError.message);
      }
    }

    return { error: null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  };

  const signOut = async () => {
    writeCachedProfile(null);
    clearChildModeState();
    // 이 기기만 로그아웃. 기본값(global)은 같은 부모 계정으로 자녀 모드 중인
    // 아이 기기까지 모두 로그아웃시킨다.
    await supabase.auth.signOut({ scope: "local" });
    setUser(null);
    setProfile(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, profile, session, loading, signUp, signIn, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// 계정 구조 개편 전의 학생 로그인 계정(아이디+PIN)으로 로그인된 세션인지.
// 이런 세션은 더 이상 쓸 수 없으므로 부모 계정으로 다시 로그인하도록 안내한다.
export function isLegacyStudent(user: User | null, profile: Profile | null): boolean {
  if (!user) return false;
  const role = profile?.role ?? (user.user_metadata?.role as string | undefined);
  return role === "student";
}
