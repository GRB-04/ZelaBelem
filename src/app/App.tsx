import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { getAdminSession, clearAdminSession, type AdminSession } from "../lib/adminSession";
import Login from "./Login";
import Dashboard from "../pages/Dashboard";

export default function App() {
  const [adminSession, setAdminSession] = useState<AdminSession | null>(() => getAdminSession());
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(() => {
    if (getAdminSession()) return false;
    return isSupabaseConfigured;
  });
  const [bypass, setBypass] = useState<boolean>(() => {
    return localStorage.getItem("zelabelem_guest_mode") === "true";
  });

  useEffect(() => {
    if (!isSupabaseConfigured || adminSession) {
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
        setLoading(false);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, [adminSession]);

  function handleAdminLogin(newAdminSession: AdminSession) {
    setAdminSession(newAdminSession);
    localStorage.removeItem("zelabelem_guest_mode");
  }

  function handleAdminLogout() {
    clearAdminSession();
    setAdminSession(null);
    setBypass(false);
    localStorage.removeItem("zelabelem_guest_mode");
  }

  function handleCitizenBypass() {
    setBypass(true);
    localStorage.setItem("zelabelem_guest_mode", "true");
  }

  function handleCitizenLogout() {
    setBypass(false);
    localStorage.removeItem("zelabelem_guest_mode");
    if (isSupabaseConfigured) {
      supabase.auth.signOut();
    }
  }

  if (loading) return null;

  // Admin session active
  if (adminSession) {
    return (
      <Dashboard
        session={null}
        adminSession={adminSession}
        onAdminLogout={handleAdminLogout}
      />
    );
  }

  // Regular user flow: show login if neither session nor guest mode is active
  if (!session && !bypass) {
    return (
      <Login
        onBypass={handleCitizenBypass}
        onAdminLogin={handleAdminLogin}
      />
    );
  }

  return <Dashboard session={session} onCitizenLogout={handleCitizenLogout} />;
}