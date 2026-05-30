"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";

export default function HomePage() {
  const { user, profile, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user || !profile) {
      window.location.replace("/login");
      return;
    }
    if (profile.role === "parent") {
      window.location.replace("/parent");
    } else if (profile.role === "student") {
      window.location.replace("/student");
    }
  }, [user, profile, loading]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-4xl animate-bounce-slow">📚</div>
    </div>
  );
}
