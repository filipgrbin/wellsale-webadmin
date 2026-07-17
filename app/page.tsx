"use client";

import { useState, useEffect } from "react";
import { SubadminLogin } from "@/components/subadmin-login";
import { SubadminDashboard } from "@/components/subadmin-dashboard";
import type { SubadminSession } from "@/lib/subadmin-session";

export type { SubadminSession } from "@/lib/subadmin-session";

export default function SubadminPage() {
  const [session, setSession] = useState<SubadminSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for existing session in localStorage
    const savedSession = localStorage.getItem("subadmin_session");
    if (savedSession) {
      try {
        setSession(JSON.parse(savedSession));
      } catch {
        localStorage.removeItem("subadmin_session");
      }
    }
    setIsLoading(false);
  }, []);

  const handleLogin = (newSession: SubadminSession) => {
    setSession(newSession);
    localStorage.setItem("subadmin_session", JSON.stringify(newSession));
  };

  const handleLogout = () => {
    setSession(null);
    localStorage.removeItem("subadmin_session");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!session) {
    return <SubadminLogin onLogin={handleLogin} />;
  }

  return <SubadminDashboard session={session} onLogout={handleLogout} />;
}
