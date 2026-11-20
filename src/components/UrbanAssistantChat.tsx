import { useEffect, useRef, useState } from 'react'
import { Send, X, Sparkles, Loader2, Mic, MicOff, CheckCircle2, Navigation } from 'lucide-react'
import {
  sendMessageToChatbot,
  mergeDrafts,
  type ChatHistoryMessage,
  type IssueDraft,
} from '../services/chatbot'

interface UrbanAssistantChatProps {
  onClose: () => void
  onStartReport: (initialData: Partial<IssueDraft>) => void
  currentUserName?: string
}

interface ChatMessage {
  id: string
  role: 'assistant' | 'user'
  text: string
}

interface SpeechRecognitionResultItem {
  transcript: string
}

interface SpeechRecognitionResultList {
  [index: number]: {
    [index: number]: SpeechRecognitionResultItem
  }
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList
}

interface ISpeechRecognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onstart: () => void
  onend: () => void
  onerror: () => void
  onresult: (e: SpeechRecognitionEvent) => void
  start: () => void
  stop: () => void
}

declare global {
  interface Window {
    SpeechRecognition?: new () => ISpeechRecognition
    webkitSpeechRecognition?: new () => ISpeechRecognition
  }
}

function severityLabel(s?: string) {
  if (s === 'critical') return 'Crítica'
  if (s === 'high') return 'Alta'
  if (s === 'medium') return 'Média'
  if (s === 'low') return 'Baixa'
  return 'Média'
}

export default function UrbanAssistantChat({
  onClose,
  onStartReport,
  currentUserName = 'Usuário',
}: UrbanAssistantChatProps) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: crypto.randomUUID(),
      role: 'assistant',
      text: 'Olá! Sou o Zé, assistente do Zela. Sobre o que você gostaria de falar? Pode me contar algum problema urbano que esteja acontecendo em Belém ou tirar dúvidas!',
    },
  ])
  const [loading, setLoading] = useState(false)
  const [draft, setDraft] = useState<IssueDraft>({})
  const [showReview, setShowReview] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [micError, setMicError] = useState('')
  const [speechSupported] = useState(() => {
    if (typeof window === 'undefined') return false
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  })
  const [locating, setLocating] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const recognitionRef = useRef<ISpeechRecognition | null>(null)
  const historyRef = useRef<ChatHistoryMessage[]>([])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, showReview])

  // Speech recognition initialization
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (SR) {
      const rec = new SR()
      rec.lang = 'pt-BR'
      rec.continuous = false
      rec.interimResults = false
      rec.onstart = () => { setIsRecording(true); setMicError('') }
      rec.onend = () => setIsRecording(false)
      rec.onerror = () => { setMicError('Erro ao acessar o microfone.'); setIsRecording(false) }
      rec.onresult = (e: SpeechRecognitionEvent) => setInput(e.results[0][0].transcript)
      recognitionRef.current = rec
    }
  }, [])

  const toggleRecording = () => {
    if (!recognitionRef.current) return
    if (isRecording) {
      recognitionRef.current.stop()
    } else {
      recognitionRef.current.start()
    }
  }

  const addMsg = (role: 'assistant' | 'user', text: string) => {
    const msg: ChatMessage = { id: crypto.randomUUID(), role, text }
    setMessages(prev => [...prev, msg])
    return msg
  }

  // Geolocation helper
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      addMsg('assistant', 'Seu navegador não suporta geolocalização. Por favor, me informe o nome da rua ou bairro onde está o problema.')
      return
    }

    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLocating(false)
        const { latitude, longitude } = pos.coords

        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=pt`
          )
          const data = await res.json()
          const road = data.address?.road || data.address?.pedestrian || ''
          const suburb = data.address?.suburb || data.address?.neighbourhood || ''
          const city_district = data.address?.city_district || ''
          const neighborhood = suburb || city_district || 'Belém'
          const address = road || 'Localização obtida por GPS'

          const locationText = `${road ? road + ', ' : ''}${neighborhood}`

          addMsg('user', `Minha localização: ${locationText}`)

          const updatedDraft: IssueDraft = {
            ...draft,
            address,
            neighborhood,
            coordinates: { lat: latitude, lng: longitude },
          }
          setDraft(updatedDraft)

          // Inform Zé about the location update
          historyRef.current = [
            ...historyRef.current,
            { role: 'user', content: `Minha localização atual é: ${locationText}` }
          ]

          // Check if now ready to publish
          if (updatedDraft.description && updatedDraft.category) {
            addMsg('assistant', `Localização registrada em ${locationText}! Todas as informações necessárias estão prontas. Gostaria de publicar essa ocorrência agora?`)
            setShowReview(true)
          } else {
            addMsg('assistant', `Localização registrada em ${locationText}! O que mais você gostaria de relatar sobre o ocorrido?`)
          }
        } catch {
          setLocating(false)
          const fallback = `Lat ${latitude.toFixed(5)}, Lon ${longitude.toFixed(5)}`
          addMsg('user', `Coordenadas: ${fallback}`)
          setDraft(prev => ({ ...prev, address: fallback, coordinates: { lat: latitude, lng: longitude } }))
          addMsg('assistant', 'Localização registrada pelas coordenadas! Gostaria de publicar ou adicionar mais detalhes?')
        }
      },
      () => {
        setLocating(false)
        addMsg('assistant', 'Não consegui acessar sua localização. Você pode me dizer a rua ou o bairro onde isso está acontecendo?')
      },
      { timeout: 8000 }
    )
  }

  // Handle direct request to publish
  const attemptPublish = (currentDraftData: IssueDraft) => {
    const missing: string[] = []
    if (!currentDraftData.description || currentDraftData.description.trim().length < 5) {
      missing.push('a descrição do problema')
    }
    if (!currentDraftData.category) {
      missing.push('o tipo/categoria do problema')
    }
    if (!currentDraftData.address && !currentDraftData.neighborhood) {
      missing.push('o endereço ou bairro onde aconteceu')
    }

    if (missing.length > 0) {
      addMsg('assistant', `Para podermos publicar, ainda falta informar ${missing.join(' e ')}. Pode me passar esses dados?`)
      return false
    }

    setShowReview(true)
    return true
  }

  // Main send handler
  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || loading) return
    setInput('')

    addMsg('user', trimmed)
    setLoading(true)

    historyRef.current = [...historyRef.current, { role: 'user', content: trimmed }]

    try {
      const response = await sendMessageToChatbot({
        userMessage: trimmed,
        history: historyRef.current,
        currentDraft: draft,
        currentUserName,
      })

      historyRef.current = [...historyRef.current, { role: 'assistant', content: response.reply }]
      addMsg('assistant', response.reply)

      // Merge newly extracted issue details into our ongoing draft
      const newDraft = mergeDrafts(draft, response.issueData)
      setDraft(newDraft)

      // Check if ready to submit
      if (response.readyToSubmit) {
        setShowReview(true)
      } else {
        // If user explicitly asked to publish in this message, validate
        const wantsToPublish = /\b(publicar|publica|postar|posta|registrar|registra|sim|quero publicar|pode publicar|confirmo)\b/i.test(trimmed)
        if (wantsToPublish && (newDraft.description || newDraft.category)) {
          attemptPublish(newDraft)
        }
      }
    } catch (e) {
      console.warn('Erro ao processar mensagem do chatbot:', e)
      addMsg('assistant', 'Entendido. Gostaria de publicar essa ocorrência no Zela ou quer me dar mais informações?')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmPublish = () => {
    if (draft) {
      onStartReport(draft)
      onClose()
    }
  }

  const handleRestart = () => {
    setDraft({})
    setShowReview(false)
    addMsg('assistant', 'Tudo bem! Se quiser relatar qualquer outro problema urbano, é só me contar.')
  }

  const hasDraftInfo = Boolean(draft.description || draft.category || draft.neighborhood || draft.address)

  return (
    <div className="chat-panel">
      {/* Header */}
      <div className="chat-header">
        <div>
          <div className="chat-header-title-row">
            <h3 className="chat-title">Assistente Zé</h3>
            <span className="chat-status-dot"></span>
          </div>
          <p className="chat-subtitle">Zeladoria Urbana de Belém</p>
        </div>
        <button className="chat-close-button" onClick={onClose} aria-label="Fechar chat">
          <X size={16} />
        </button>
      </div>

      {/* Messages */}
      <div className="chat-body">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`chat-bubble chat-bubble--${message.role}`}
          >
            {message.text}
          </div>
        ))}

        {loading && (
          <div className="chat-bubble chat-bubble--assistant chat-bubble--typing">
            <Loader2 size={16} className="spin" />
            <span>Processando...</span>
          </div>
        )}

        {/* Location GPS Shortcut Action */}
        {!draft.address && !draft.neighborhood && hasDraftInfo && (
          <div className="chat-location-action" style={{ margin: '8px 0' }}>
            <button
              type="button"
              className="chat-location-btn"
              onClick={handleUseMyLocation}
              disabled={locating}
            >
              {locating ? <Loader2 size={15} className="spin" /> : <Navigation size={15} />}
              <span>{locating ? 'Obtendo localização...' : 'Informar minha localização atual (GPS)'}</span>
            </button>
          </div>
        )}

        {/* Review Card */}
        {showReview && (
          <div className="chat-draft-card chat-draft-card--final">
            <div className="chat-draft-header">
              <Sparkles size={14} className="sparkle-icon" />
              <span>Resumo da Ocorrência</span>
            </div>
            <div className="chat-draft-details">
              <div className="chat-draft-field">
                <strong>Descrição:</strong>
                <span>{draft.description || 'Não informada'}</span>
              </div>
              <div className="chat-draft-field">
                <strong>Categoria:</strong>
                <span>{draft.category || 'Vias e Pavimentação'}</span>
              </div>
              <div className="chat-draft-field">
                <strong>Local:</strong>
                <span>{[draft.address, draft.neighborhood].filter(Boolean).join(', ') || 'Não informado'}</span>
              </div>
              <div className="chat-draft-field">
                <strong>Urgência:</strong>
                <span>{severityLabel(draft.severity)}</span>
              </div>
              <div className="chat-draft-field">
                <strong>Identificação:</strong>
                <span>{draft.anonymous ? 'Anônimo' : 'Identificado'}</span>
              </div>
            </div>
            <div className="chat-draft-actions">
              <button type="button" className="chat-draft-submit-btn" onClick={handleConfirmPublish}>
                <CheckCircle2 size={14} />
                <span>Confirmar e Publicar</span>
              </button>
              <button type="button" className="chat-draft-clear-btn" onClick={handleRestart}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {micError && <div className="chat-mic-error">{micError}</div>}

      {/* Ongoing draft status pill */}
      {hasDraftInfo && !showReview && (
        <div style={{
          padding: '8px 14px',
          background: 'rgba(255,255,255,0.04)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#a1a1aa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ color: '#60a5fa', fontWeight: 600 }}>Rascunho:</span>
            <span>{draft.category || 'Problema em relato'}</span>
            <span>•</span>
            <span style={{ color: draft.address || draft.neighborhood ? '#e4e4e7' : '#f59e0b' }}>
              {[draft.address, draft.neighborhood].filter(Boolean).join(', ') || 'Local pendente'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => attemptPublish(draft)}
            style={{
              background: '#0284c7',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            Publicar
          </button>
        </div>
      )}

      {/* Input row */}
      <div className="chat-input-row">
        <input
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isRecording ? 'Ouvindo...' : 'Digite sua mensagem para o Zé...'}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleSend() }}
          disabled={loading || locating}
        />

        {speechSupported && (
          <button
            type="button"
            className={`chat-mic-button ${isRecording ? 'recording' : ''}`}
            onClick={toggleRecording}
            disabled={loading}
            aria-label="Usar microfone"
          >
            {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
        )}

        <button
          className="chat-send-button"
          onClick={() => void handleSend()}
          aria-label="Enviar"
          disabled={loading || !input.trim() || locating}
        >
          <Send size={16} />
        </button>
      </div>

      <div className="chat-mic-help">
        {speechSupported ? 'Você pode conversar por texto ou usar o microfone.' : 'Converse com o Zé sobre qualquer problema urbano em Belém.'}
      </div>
    </div>
  )
}
