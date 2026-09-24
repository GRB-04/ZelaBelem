import React, { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

// ─── Admin credentials (hardcoded for academic use) ───────────────────────
const ADMIN_EMAIL = "admin@zelabelem.com.br";
const ADMIN_PASSWORD = "admin";
const ADMIN_SESSION_KEY = "zelabelem_admin_session";

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

type OtpStep = "email" | "code" | "password";

interface LoginProps {
  onBypass?: () => void;
  onAdminLogin?: (session: AdminSession) => void;
}

export default function Login({ onBypass: _onBypass, onAdminLogin }: LoginProps) {
  // ─── OTP flow ────────────────────────────────────────────────────────────
  const [otpStep, setOtpStep] = useState<OtpStep>("email");
  const [authMode, setAuthMode] = useState<"login" | "register" | "admin">("login");
  const [otpName, setOtpName] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [resendCooldown, setResendCooldown] = useState(0);

  // ─── Admin password ───────────────────────────────────────────────────────
  const [adminPassword, setAdminPassword] = useState("");

  // ─── Shared ───────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function resetMessages() {
    setError(null);
    setSuccess(null);
  }

  // ─── Resend cooldown timer ─────────────────────────────────────────────
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // ─── OTP: send code ───────────────────────────────────────────────────────
  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    resetMessages();

    if (!otpEmail.trim() || !otpEmail.includes("@")) {
      setError("Digite um email válido.");
      return;
    }

    // ─── Admin shortcut ───────────────────────────────────────────────────
    if (otpEmail.trim().toLowerCase() === ADMIN_EMAIL) {
      setAdminPassword("");
      setOtpStep("password");
      return;
    }

    if (authMode === "register" && !otpName.trim()) {
      setError("Por favor, digite seu nome.");
      return;
    }

    try {
      setLoading(true);

      const options: any = { shouldCreateUser: authMode === "register" };
      if (authMode === "register" && otpName.trim()) {
        options.data = { full_name: otpName.trim() };
      }

      const { error } = await supabase.auth.signInWithOtp({
        email: otpEmail.trim(),
        options,
      });
      if (error) throw error;

      setOtpStep("code");
      setResendCooldown(60);
      setSuccess("📩 Código enviado! Confira sua caixa de entrada.");
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      if (msg.toLowerCase().includes("rate limit")) {
        setError("Muitas tentativas. Aguarde alguns minutos.");
      } else if (msg.toLowerCase().includes("signups not allowed") || msg.toLowerCase().includes("not found")) {
        setError("Conta não encontrada. Por favor, cadastre-se primeiro.");
      } else {
        setError(msg || "Não foi possível enviar o código.");
      }
    } finally {
      setLoading(false);
    }
  }

  // ─── Admin: verify password ───────────────────────────────────────────────
  function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault();
    resetMessages();

    if (!adminPassword) {
      setError("Digite a senha do administrador.");
      return;
    }

    if (adminPassword !== ADMIN_PASSWORD) {
      setError("Senha incorreta. Tente novamente.");
      return;
    }

    const session: AdminSession = {
      isAdmin: true,
      email: ADMIN_EMAIL,
      name: "Administrador",
    };

    localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
    setSuccess("✅ Acesso administrativo autorizado! Carregando painel…");

    setTimeout(() => {
      if (onAdminLogin) onAdminLogin(session);
    }, 600);
  }

  // ─── OTP: verify code ─────────────────────────────────────────────────────
  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    resetMessages();

    const token = otpDigits.join("");
    if (token.length < 6) {
      setError("Digite todos os 6 dígitos do código.");
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase.auth.verifyOtp({
        email: otpEmail.trim(),
        token,
        type: "email",
      });
      if (error) throw error;

      if (otpName.trim() && data?.session) {
        await supabase.auth.updateUser({
          data: { full_name: otpName.trim() }
        });
      }

      setSuccess("✅ Acesso autorizado! Carregando painel…");
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      if (msg.toLowerCase().includes("invalid") || msg.toLowerCase().includes("expired")) {
        setError("Código inválido ou expirado. Solicite um novo.");
      } else {
        setError(msg || "Não foi possível verificar o código.");
      }
    } finally {
      setLoading(false);
    }
  }

  // ─── OTP digit inputs ─────────────────────────────────────────────────────
  function handleDigitChange(index: number, value: string) {
    const sanitized = value.replace(/\D/g, "").slice(-1);
    const next = [...otpDigits];
    next[index] = sanitized;
    setOtpDigits(next);
    if (sanitized && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  }

  function handleDigitKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  }

  function handleDigitPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const next = [...otpDigits];
    for (let i = 0; i < 6; i++) next[i] = pasted[i] ?? "";
    setOtpDigits(next);
    const lastFilled = Math.min(pasted.length, 5);
    otpRefs.current[lastFilled]?.focus();
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <div style={s.card}>
        {/* Logo */}
        <div style={s.logoWrap}>
          <img src="/logo.png" alt="Zela" style={s.logo} />
        </div>
        <h1 style={s.title}>Zela</h1>

        {/* ── Access type selector (shown on first step) ── */}
        {otpStep === "email" && (
          <div style={s.accessSelector}>
            <button
              type="button"
              style={{ ...s.accessBtn, ...(authMode !== "admin" ? s.accessBtnActive : {}) }}
              onClick={() => { setAuthMode("login"); resetMessages(); }}
            >
              👤 Cidadão
            </button>
            <button
              type="button"
              style={{ ...s.accessBtn, ...(authMode === "admin" ? { ...s.accessBtnActive, background: "#2d1f00", borderColor: "#f59e0b", color: "#fbbf24" } : {}) }}
              onClick={() => {
                setOtpEmail(ADMIN_EMAIL);
                setAdminPassword("");
                setOtpStep("password");
                resetMessages();
              }}
            >
              🛡️ Administrador
            </button>
          </div>
        )}

        {/* ── STEP 1: Email (Cidadão) ── */}
        {otpStep === "email" && (
          <>
            <div style={s.tabContainer}>
              <button type="button" onClick={() => { setAuthMode("login"); resetMessages(); }} style={{ ...s.tabBtn, background: authMode === "login" ? "#2A2A33" : "transparent", color: authMode === "login" ? "#fff" : "#71717A" }}>
                Entrar
              </button>
              <button type="button" onClick={() => { setAuthMode("register"); resetMessages(); }} style={{ ...s.tabBtn, background: authMode === "register" ? "#2A2A33" : "transparent", color: authMode === "register" ? "#fff" : "#71717A" }}>
                Cadastrar
              </button>
            </div>

            <p style={s.subtitle}>
              {authMode === "login"
                ? "Digite seu email para receber um código de acesso."
                : "Crie sua conta informando seus dados abaixo."}
            </p>

            <form onSubmit={handleSendOtp} style={s.form}>
              {authMode === "register" && (
                <>
                  <label style={s.label}>Nome</label>
                  <input
                    style={s.input}
                    type="text"
                    placeholder="Como quer ser chamado?"
                    value={otpName}
                    onChange={(e) => setOtpName(e.target.value)}
                    autoComplete="name"
                    autoFocus
                    required
                  />
                </>
              )}

              <label style={s.label}>Email</label>
              <input
                style={s.input}
                type="email"
                placeholder="voce@dominio.com"
                value={otpEmail}
                onChange={(e) => setOtpEmail(e.target.value)}
                autoComplete="email"
                autoFocus={authMode === "login"}
                required
              />

              <button
                style={{
                  ...s.button,
                  opacity: loading || !otpEmail.trim() || (authMode === "register" && !otpName.trim()) ? 0.6 : 1,
                  cursor: loading || !otpEmail.trim() || (authMode === "register" && !otpName.trim()) ? "not-allowed" : "pointer",
                }}
                disabled={loading || !otpEmail.trim() || (authMode === "register" && !otpName.trim())}
              >
                {loading ? "Enviando…" : (authMode === "login" ? "Continuar" : "Criar conta")}
              </button>

              {success && <div style={s.success}>{success}</div>}
              {error && <div style={s.error}>{error}</div>}
            </form>
          </>
        )}

        {/* ── STEP 2: Code digits ── */}
        {otpStep === "code" && (
          <>
            <p style={s.subtitle}>
              Código enviado para <strong>{otpEmail}</strong>.<br />
              <span style={{ color: "#71717A", fontSize: 12 }}>
                Verifique sua caixa de entrada e spam.
              </span>
            </p>

            <form onSubmit={handleVerifyOtp} style={s.form}>
              <label style={{ ...s.label, textAlign: "center", marginBottom: 4 }}>
                Digite o código de 6 dígitos
              </label>

              <div style={s.otpRow}>
                {otpDigits.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { otpRefs.current[i] = el; }}
                    style={s.otpBox}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigitChange(i, e.target.value)}
                    onKeyDown={(e) => handleDigitKeyDown(i, e)}
                    onPaste={i === 0 ? handleDigitPaste : undefined}
                    autoFocus={i === 0}
                  />
                ))}
              </div>

              <button
                style={{
                  ...s.button,
                  opacity: loading || otpDigits.join("").length < 6 ? 0.6 : 1,
                  cursor: loading || otpDigits.join("").length < 6 ? "not-allowed" : "pointer",
                }}
                disabled={loading || otpDigits.join("").length < 6}
              >
                {loading ? "Verificando…" : "Confirmar código"}
              </button>

              <button
                type="button"
                style={{
                  ...s.linkBtn,
                  opacity: resendCooldown > 0 || loading ? 0.5 : 1,
                  cursor: resendCooldown > 0 || loading ? "not-allowed" : "pointer",
                }}
                disabled={resendCooldown > 0 || loading}
                onClick={() => {
                  setOtpDigits(["", "", "", "", "", ""]);
                  resetMessages();
                  setOtpStep("email");
                }}
              >
                {resendCooldown > 0
                  ? `Reenviar em ${resendCooldown}s`
                  : "← Voltar e reenviar código"}
              </button>

              {success && <div style={s.success}>{success}</div>}
              {error && <div style={s.error}>{error}</div>}
            </form>
          </>
        )}

        {/* ── STEP 3: Admin password ── */}
        {otpStep === "password" && (
          <>
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              marginBottom: 14,
            }}>
              <div style={{
                width: 52, height: 52, borderRadius: "50%",
                background: "rgba(245,158,11,0.15)",
                border: "1px solid rgba(245,158,11,0.4)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 24,
              }}>🛡️</div>
              <span style={{ color: "#f59e0b", fontWeight: 700, fontSize: 15 }}>
                Acesso Administrativo
              </span>
            </div>

            {/* Credentials hint */}
            <div style={{
              background: "rgba(245,158,11,0.08)",
              border: "1px solid rgba(245,158,11,0.2)",
              borderRadius: 12,
              padding: "10px 14px",
              marginBottom: 16,
              textAlign: "left",
            }}>
              <div style={{ fontSize: 11, color: "#a16207", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Credenciais de acesso
              </div>
              <div style={{ fontSize: 13, color: "#fbbf24", fontFamily: "monospace" }}>
                📧 {ADMIN_EMAIL}
              </div>
              <div style={{ fontSize: 13, color: "#fbbf24", fontFamily: "monospace" }}>
                🔑 Senha: <strong>admin</strong>
              </div>
            </div>

            <form onSubmit={handleAdminLogin} style={s.form}>
              <label style={s.label}>Senha do Administrador</label>
              <input
                style={s.input}
                type="password"
                placeholder="Digite a senha"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                autoFocus
                required
              />

              <button
                style={{
                  ...s.button,
                  background: "linear-gradient(135deg, #f59e0b, #d97706)",
                  opacity: !adminPassword ? 0.6 : 1,
                  cursor: !adminPassword ? "not-allowed" : "pointer",
                }}
                disabled={!adminPassword}
              >
                Entrar como Administrador
              </button>

              <button
                type="button"
                style={s.linkBtn}
                onClick={() => {
                  setOtpStep("email");
                  setOtpEmail("");
                  setAdminPassword("");
                  resetMessages();
                }}
              >
                ← Voltar para login cidadão
              </button>

              {success && <div style={s.success}>{success}</div>}
              {error && <div style={s.error}>{error}</div>}
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  accessSelector: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    marginBottom: 20,
  },
  accessBtn: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #2A2A33",
    background: "transparent",
    color: "#71717A",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.2s",
  },
  accessBtnActive: {
    background: "#1a2535",
    borderColor: "#0A84FF",
    color: "#60a5fa",
  },

  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background:
      "linear-gradient(rgba(11,11,13,0.45),rgba(11,11,13,0.85)), url('/background.jpg') no-repeat center center fixed",
    backgroundSize: "cover",
    color: "#fff",
    padding: 24,
    fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
  },
  card: {
    width: "100%",
    maxWidth: 400,
    background: "rgba(17,17,20,0.84)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 22,
    padding: "32px 28px",
    boxShadow: "0 24px 60px rgba(0,0,0,.65)",
    textAlign: "center",
  },
  logoWrap: { display: "grid", placeItems: "center", marginBottom: 12 },
  logo: { width: 90, height: 90, objectFit: "contain", borderRadius: "22%" },
  title: { margin: "6px 0 10px", fontSize: 28, fontWeight: 700 },
  subtitle: { margin: "0 0 20px", fontSize: 14, color: "#A1A1AA", lineHeight: 1.5 },

  form: { display: "grid", gap: 10, textAlign: "left" },
  label: { fontSize: 12, color: "#A1A1AA" },
  input: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid #2A2A33",
    background: "#0E0E12",
    color: "#fff",
    outline: "none",
    fontSize: 14,
    boxSizing: "border-box",
  },
  tabContainer: {
    display: "flex",
    background: "#0E0E12",
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tabBtn: {
    flex: 1,
    padding: "10px 0",
    border: "none",
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.2s",
  },

  // OTP digit boxes
  otpRow: {
    display: "flex",
    justifyContent: "center",
    gap: 10,
    margin: "8px 0",
  },
  otpBox: {
    width: 48,
    height: 58,
    borderRadius: 14,
    border: "1px solid #2A2A33",
    background: "#0E0E12",
    color: "#fff",
    fontSize: 24,
    fontWeight: 700,
    textAlign: "center",
    outline: "none",
    caretColor: "#0A84FF",
    transition: "border-color 0.2s",
  },

  button: {
    marginTop: 8,
    padding: "13px 14px",
    borderRadius: 14,
    border: "none",
    background: "#0A84FF",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: 14,
  },
  linkBtn: {
    marginTop: 4,
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid #2A2A33",
    background: "transparent",
    color: "#A1A1AA",
    fontSize: 13,
    cursor: "pointer",
    textAlign: "center",
  },
  success: {
    marginTop: 8,
    padding: 12,
    borderRadius: 14,
    background: "rgba(34,197,94,.12)",
    border: "1px solid rgba(34,197,94,.25)",
    color: "#B7F7CC",
    fontSize: 13,
    textAlign: "center",
  },
  error: {
    marginTop: 8,
    padding: 12,
    borderRadius: 14,
    background: "rgba(239,68,68,.12)",
    border: "1px solid rgba(239,68,68,.25)",
    color: "#FECACA",
    fontSize: 13,
    textAlign: "center",
  },
};