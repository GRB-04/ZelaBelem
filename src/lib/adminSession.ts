// Admin credentials (for academic demonstration use)
export const ADMIN_EMAIL = "admin@zelabelem.com.br";
export const ADMIN_PASSWORD = "admin";
export const ADMIN_SESSION_KEY = "zelabelem_admin_session";

export type AdminSession = {
  isAdmin: true;
  email: string;
  name: string;
};

export function getAdminSession(): AdminSession | null {
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AdminSession;
  } catch {
    return null;
  }
}

export function clearAdminSession() {
  localStorage.removeItem(ADMIN_SESSION_KEY);
}
