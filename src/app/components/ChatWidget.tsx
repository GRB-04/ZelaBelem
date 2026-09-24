import { useEffect, useMemo, useRef, useState } from "react";
import {
  MessageCircle,
  Send,
  X,
  Bot,
  Loader2,
  Mic,
  MicOff,
  MapPin,
  CheckCircle2,
  RotateCcw,
  ChevronRight,
} from "lucide-react";
import type { ReportModalInitialData } from "./ReportModal";
import {
  sendMessageToChatbot,
  type ChatHistoryMessage,
  type IssueDraft,
} from "../../services/chatbot";

interface ChatWidgetProps {
  darkMode: boolean;
  currentUserName: string;
  onStartReport: (initialData: ReportModalInitialData) => void;
}

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: any) => void) | null;
  onresult: ((event: any) => void) | null;
  start: () => void;
  stop: () => void;
};

declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

function createId() {
  return Math.random().toString(36).slice(2, 10);
}

function mergeDrafts(currentDraft: IssueDraft | null, nextDraft: IssueDraft): IssueDraft {
  return {
    title: nextDraft.title || currentDraft?.title || "",
    category: nextDraft.category || currentDraft?.category || "",
    otherCategory: nextDraft.otherCategory || currentDraft?.otherCategory || "",
    neighborhood: nextDraft.neighborhood || currentDraft?.neighborhood || "",
    address: nextDraft.address || currentDraft?.address || "",
    description: nextDraft.description || currentDraft?.description || "",
    severity: nextDraft.severity || currentDraft?.severity || "medium",
    anonymous:
      typeof nextDraft.anonymous === "boolean"
        ? nextDraft.anonymous
        : currentDraft?.anonymous ?? false,
  };
}

function severityPtLabel(severity?: string) {
  if (severity === "critical") return "🔴 Crítica";
  if (severity === "high") return "🟠 Alta";
  if (severity === "medium") return "🟡 Média";
  if (severity === "low") return "🟢 Baixa";
  return "—";
}

// Detect if assistant message is asking about location
function isAskingLocation(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("endereço") ||
    lower.includes("bairro") ||
    lower.includes("onde") ||
    lower.includes("localização") ||
    lower.includes("local") ||
    lower.includes("localiza") ||
    lower.includes("rua") ||
    lower.includes("região")
  );
}

export function ChatWidget({
  darkMode: _darkMode,
  currentUserName,
  onStartReport,
}: ChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [issueDraft, setIssueDraft] = useState<IssueDraft | null>(null);
  const [readyToSubmit, setReadyToSubmit] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [locatingUser, setLocatingUser] = useState(false);
  const [showLocationBtn, setShowLocationBtn] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const STORAGE_KEY = `chat_history_v2_${currentUserName}`;

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved) as ChatMessage[];
    } catch {
      // ignore
    }
    return [
      {
        id: createId(),
        role: "assistant",
        text: `Olá, ${currentUserName}! 👋 Sou o Zé, assistente do Zela.\n\nMe conta: qual problema urbano você está vendo? Pode descrever com suas próprias palavras.`,
      },
    ];
  });

  // Persist messages to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // ignore quota errors
    }
  }, [messages, STORAGE_KEY]);

  const quickActions = useMemo(
    () => [
      "Tem um poste apagado na minha rua",
      "Há um buraco grande no asfalto",
      "Acúmulo de lixo no bairro",
    ],
    []
  );

  // Speech recognition setup
  useEffect(() => {
    const SpeechRecognitionCtor =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      setSpeechSupported(false);
      return;
    }

    setSpeechSupported(true);
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "pt-BR";
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = () => {
      setMicError(null);
      setIsRecording(true);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.onerror = (event: any) => {
      setIsRecording(false);
      if (event?.error === "not-allowed") {
        setMicError("Permissão de microfone negada no navegador.");
        return;
      }
      if (event?.error === "no-speech") {
        setMicError("Não consegui ouvir. Tente novamente.");
        return;
      }
      setMicError("Não foi possível usar o microfone agora.");
    };

    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript.trim());
    };

    recognitionRef.current = recognition;

    return () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (!open) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading, open, readyToSubmit]);

  function pushMessage(message: ChatMessage) {
    setMessages((prev) => [...prev, message]);
  }

  function resetConversation() {
    setIssueDraft(null);
    setReadyToSubmit(false);
    setShowLocationBtn(false);
    setMessages([
      {
        id: createId(),
        role: "assistant",
        text: `Tudo certo! Me conta: qual problema urbano você está vendo?`,
      },
    ]);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  // Use GPS / IP location to fill address
  async function handleUseMyLocation() {
    setLocatingUser(true);

    const fillFromCoords = async (lat: number, lng: number) => {
      try {
        // Try reverse geocoding via Nominatim
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=pt`,
          { headers: { "Accept-Language": "pt-BR,pt;q=0.9" } }
        );
        const data = await res.json();
        const address = data?.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        const neighborhood =
          data?.address?.suburb ||
          data?.address?.neighbourhood ||
          data?.address?.city_district ||
          "";

        const locationText = neighborhood
          ? `${address.split(",")[0]}, ${neighborhood}`
          : address.split(",").slice(0, 2).join(",");

        // Send as user message
        await handleSend(`Minha localização atual: ${locationText} (lat: ${lat.toFixed(5)}, lng: ${lng.toFixed(5)})`);
      } catch {
        await handleSend(`Minha localização: lat ${lat.toFixed(5)}, lng ${lng.toFixed(5)}`);
      } finally {
        setLocatingUser(false);
        setShowLocationBtn(false);
      }
    };

    const tryIP = async () => {
      try {
        const res = await fetch("https://ipapi.co/json/");
        const data = await res.json();
        if (typeof data.latitude === "number" && typeof data.longitude === "number") {
          await fillFromCoords(data.latitude, data.longitude);
          return;
        }
      } catch {}
      try {
        const res = await fetch("https://ip-api.com/json/");
        const data = await res.json();
        if (typeof data.lat === "number" && typeof data.lon === "number") {
          await fillFromCoords(data.lat, data.lon);
          return;
        }
      } catch {}
      setLocatingUser(false);
      pushMessage({
        id: createId(),
        role: "assistant",
        text: "Não consegui obter sua localização automaticamente. Pode me dizer o endereço ou bairro?",
      });
    };

    if (!navigator.geolocation) {
      await tryIP();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await fillFromCoords(pos.coords.latitude, pos.coords.longitude);
      },
      async () => {
        await tryIP();
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  }

  async function handleSend(forcedText?: string) {
    const text = (forcedText ?? input).trim();
    if (!text || loading) return;

    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      text,
    };

    pushMessage(userMessage);
    setInput("");
    setLoading(true);
    setMicError(null);

    try {
      const history: ChatHistoryMessage[] = messages.map((message) => ({
        role: message.role,
        content: message.text,
      }));

      const response = await sendMessageToChatbot({
        userMessage: text,
        history,
        currentDraft: issueDraft ?? undefined,
        currentUserName,
      });

      // Merge draft data
      const mergedDraft = mergeDrafts(issueDraft, response.issueData || {});
      const hasMeaningfulDraft =
        Boolean(mergedDraft.title) ||
        Boolean(mergedDraft.category) ||
        Boolean(mergedDraft.description);

      if (response.detectedIssue && hasMeaningfulDraft) {
        setIssueDraft(mergedDraft);
      }

      setReadyToSubmit(Boolean(response.readyToSubmit));

      pushMessage({
        id: createId(),
        role: "assistant",
        text: response.reply,
      });

      // Show location button if assistant is asking about location
      if (isAskingLocation(response.reply)) {
        setShowLocationBtn(true);
      } else {
        setShowLocationBtn(false);
      }
    } catch (error: any) {
      pushMessage({
        id: createId(),
        role: "assistant",
        text:
          error?.message ||
          "Desculpe, tive um problema agora. Tente novamente.",
      });
    } finally {
      setLoading(false);
    }
  }

  function handleQuickAction(value: string) {
    setInput(value);
    setTimeout(() => {
      void handleSend(value);
    }, 40);
  }

  function toggleRecording() {
    if (!speechSupported) {
      setMicError("Seu navegador não suporta transcrição por voz.");
      return;
    }
    if (!recognitionRef.current) {
      setMicError("Não foi possível inicializar o microfone.");
      return;
    }
    setMicError(null);
    if (isRecording) {
      recognitionRef.current.stop();
      return;
    }
    recognitionRef.current.start();
  }

  function handlePublish() {
    if (!issueDraft) return;
    onStartReport({
      title: issueDraft.title || "",
      category: issueDraft.category || "",
      otherCategory: issueDraft.otherCategory || "",
      neighborhood: issueDraft.neighborhood || "",
      address: issueDraft.address || "",
      description: issueDraft.description || "",
      severity: issueDraft.severity || "medium",
      anonymous: issueDraft.anonymous ?? false,
    });
    setOpen(false);
  }

  function handleCorrect() {
    setReadyToSubmit(false);
    pushMessage({
      id: createId(),
      role: "assistant",
      text: "Claro! O que você gostaria de corrigir? Me diga o que mudou.",
    });
  }

  return (
    <>
      {open && (
        <div
          className="fixed bottom-24 right-6 z-[1500] overflow-hidden flex flex-col"
          style={{
            width: 360,
            height: 580,
            borderRadius: 24,
            backgroundColor: "#F81F39",
            boxShadow: "0 20px 60px rgba(0,0,0,0.30)",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 shrink-0"
            style={{
              backgroundColor: "rgba(255,255,255,0.22)",
              borderBottom: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "rgba(255,255,255,0.92)" }}
              >
                <Bot size={18} color="#F81F39" />
              </div>

              <div>
                <div
                  className="text-sm"
                  style={{ color: "#fff", fontWeight: 700, lineHeight: 1.1 }}
                >
                  Assistente Zé
                </div>
                <div
                  className="text-xs flex items-center gap-1"
                  style={{ color: "rgba(255,255,255,0.90)" }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      backgroundColor: "#4ade80",
                      display: "inline-block",
                    }}
                  />
                  Online • Zela
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={resetConversation}
                title="Reiniciar conversa"
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{
                  backgroundColor: "rgba(255,255,255,0.15)",
                  color: "rgba(255,255,255,0.80)",
                }}
              >
                <RotateCcw size={14} />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{
                  backgroundColor: "rgba(255,255,255,0.15)",
                  color: "#fff",
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Messages area */}
          <div
            className="px-3 py-3 overflow-y-auto flex-1 min-h-0"
            style={{ backgroundColor: "#F81F39" }}
          >
            {messages.map((message) => (
              <div
                key={message.id}
                className={`mb-2 flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  style={{
                    maxWidth: "84%",
                    borderRadius: message.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                    padding: "10px 14px",
                    whiteSpace: "pre-line",
                    fontSize: 13,
                    lineHeight: 1.5,
                    backgroundColor:
                      message.role === "user"
                        ? "rgba(255,255,255,0.92)"
                        : "rgba(0,0,0,0.22)",
                    color: message.role === "user" ? "#111" : "#fff",
                  }}
                >
                  {message.text}
                </div>
              </div>
            ))}

            {loading && (
              <div className="mb-2 flex justify-start">
                <div
                  className="flex items-center gap-2"
                  style={{
                    borderRadius: "18px 18px 18px 4px",
                    padding: "10px 14px",
                    fontSize: 13,
                    backgroundColor: "rgba(0,0,0,0.22)",
                    color: "rgba(255,255,255,0.80)",
                  }}
                >
                  <Loader2 size={14} className="animate-spin" />
                  Digitando...
                </div>
              </div>
            )}

            {/* Location button — shown contextually when asked */}
            {showLocationBtn && !loading && (
              <div className="mb-2 flex justify-start">
                <button
                  type="button"
                  onClick={() => void handleUseMyLocation()}
                  disabled={locatingUser}
                  className="flex items-center gap-2 px-3 py-2 rounded-2xl text-xs"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.18)",
                    color: "#fff",
                    border: "1px solid rgba(255,255,255,0.30)",
                    fontWeight: 600,
                    opacity: locatingUser ? 0.7 : 1,
                  }}
                >
                  {locatingUser ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <MapPin size={13} />
                  )}
                  {locatingUser ? "Obtendo localização..." : "📍 Usar minha localização"}
                </button>
              </div>
            )}

            {/* Final confirmation card */}
            {readyToSubmit && issueDraft && !loading && (
              <div
                className="mt-2 mb-2 rounded-2xl overflow-hidden"
                style={{
                  backgroundColor: "rgba(255,255,255,0.14)",
                  border: "1px solid rgba(255,255,255,0.22)",
                }}
              >
                <div
                  className="flex items-center gap-2 px-3 py-2"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.16)",
                    borderBottom: "1px solid rgba(255,255,255,0.12)",
                  }}
                >
                  <CheckCircle2 size={14} color="#4ade80" />
                  <span
                    style={{ color: "#fff", fontWeight: 700, fontSize: 12 }}
                  >
                    Ocorrência pronta para publicar
                  </span>
                </div>

                <div className="px-3 py-2" style={{ fontSize: 12, color: "rgba(255,255,255,0.92)", lineHeight: 1.7 }}>
                  {issueDraft.title && (
                    <div><span style={{ opacity: 0.7 }}>Título:</span> <strong>{issueDraft.title}</strong></div>
                  )}
                  {issueDraft.category && (
                    <div><span style={{ opacity: 0.7 }}>Categoria:</span> {issueDraft.category}</div>
                  )}
                  {issueDraft.neighborhood && (
                    <div><span style={{ opacity: 0.7 }}>Bairro:</span> {issueDraft.neighborhood}</div>
                  )}
                  {issueDraft.address && (
                    <div><span style={{ opacity: 0.7 }}>Endereço:</span> {issueDraft.address}</div>
                  )}
                  {issueDraft.description && (
                    <div><span style={{ opacity: 0.7 }}>Descrição:</span> {issueDraft.description}</div>
                  )}
                  {issueDraft.severity && (
                    <div><span style={{ opacity: 0.7 }}>Urgência:</span> {severityPtLabel(issueDraft.severity)}</div>
                  )}
                  <div>
                    <span style={{ opacity: 0.7 }}>Identidade:</span>{" "}
                    {issueDraft.anonymous ? "Anônimo 🔒" : "Identificado 👤"}
                  </div>
                </div>

                <div
                  className="flex gap-2 px-3 pb-3"
                >
                  <button
                    type="button"
                    onClick={handlePublish}
                    className="flex-1 h-9 rounded-xl text-sm flex items-center justify-center gap-2"
                    style={{
                      backgroundColor: "#fff",
                      color: "#F81F39",
                      fontWeight: 700,
                    }}
                  >
                    Publicar ocorrência
                    <ChevronRight size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={handleCorrect}
                    className="h-9 px-3 rounded-xl text-sm"
                    style={{
                      backgroundColor: "rgba(255,255,255,0.15)",
                      color: "#fff",
                      border: "1px solid rgba(255,255,255,0.12)",
                      fontSize: 12,
                    }}
                  >
                    Corrigir
                  </button>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Footer */}
          <div
            className="px-3 pt-2 pb-3 shrink-0"
            style={{
              backgroundColor: "#F81F39",
              borderTop: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            {/* Quick actions — only shown before any draft */}
            {!issueDraft && (
              <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
                {quickActions.map((action) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => handleQuickAction(action)}
                    disabled={loading || isRecording}
                    className="shrink-0 px-3 py-2 rounded-full text-xs"
                    style={{
                      backgroundColor: "rgba(255,255,255,0.16)",
                      color: "#fff",
                      border: "1px solid rgba(255,255,255,0.10)",
                      opacity: loading || isRecording ? 0.6 : 1,
                    }}
                  >
                    {action}
                  </button>
                ))}
              </div>
            )}

            {micError && (
              <div
                className="mb-2 text-[11px] rounded-xl px-3 py-2"
                style={{
                  backgroundColor: "rgba(0,0,0,0.15)",
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {micError}
              </div>
            )}

            <div
              className="flex items-center gap-2 rounded-2xl px-3 py-2"
              style={{ backgroundColor: "rgba(255,255,255,0.20)" }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder={isRecording ? "Ouvindo..." : "Responda aqui..."}
                className="flex-1 bg-transparent outline-none text-sm"
                style={{ color: "#fff" }}
                disabled={loading}
              />

              <button
                type="button"
                onClick={toggleRecording}
                title={
                  speechSupported
                    ? isRecording
                      ? "Parar gravação"
                      : "Usar microfone"
                    : "Áudio não suportado"
                }
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: isRecording
                    ? "rgba(255,255,255,0.92)"
                    : "rgba(255,255,255,0.18)",
                  color: isRecording ? "#F81F39" : "#fff",
                  opacity: loading ? 0.6 : 1,
                }}
                disabled={loading}
              >
                {isRecording ? <MicOff size={15} /> : <Mic size={15} />}
              </button>

              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={loading || !input.trim()}
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: "rgba(255,255,255,0.92)",
                  color: "#F81F39",
                  opacity: loading || !input.trim() ? 0.5 : 1,
                }}
              >
                {loading ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Send size={15} />
                )}
              </button>
            </div>

            <div
              className="mt-1.5 text-[10px] text-center"
              style={{ color: "rgba(255,255,255,0.70)" }}
            >
              {speechSupported
                ? "Digite ou use o microfone para responder."
                : "Transcrição por voz não disponível neste navegador."}
            </div>
          </div>
        </div>
      )}

      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="fixed bottom-6 right-6 z-[1400] w-14 h-14 rounded-full flex items-center justify-center"
        style={{
          backgroundColor: "#F81F39",
          boxShadow: "0 14px 36px rgba(248,31,57,0.40)",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.12)",
          transition: "transform 0.2s ease, box-shadow 0.2s ease",
        }}
        aria-label={open ? "Fechar assistente" : "Abrir assistente"}
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </button>
    </>
  );
}
