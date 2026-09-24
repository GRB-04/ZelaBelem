import { useEffect, useRef, useState } from 'react'
import { Send, X, Sparkles, Loader2, Mic, MicOff, CheckCircle2, Navigation } from 'lucide-react'
import { sendMessageToChatbot, polishDescription, type ChatHistoryMessage, type IssueDraft } from '../services/chatbot'

interface UrbanAssistantChatProps {
  onClose: () => void
  onStartReport: (initialData: any) => void
  currentUserName?: string
}

interface ChatMessage {
  id: string
  role: 'assistant' | 'user'
  text: string
}

// Steps of the guided flow
type FlowStep =
  | 'idle'           // waiting for user to say something
  | 'confirm'        // asked "quer registrar?"
  | 'description'    // asking for description
  | 'location'       // asking for location
  | 'severity'       // asking urgency
  | 'anonymous'      // asking if anonymous
  | 'review'         // showing final report card

declare global {
  interface Window {
    SpeechRecognition?: any
    webkitSpeechRecognition?: any
  }
}

function severityLabel(s?: string) {
  if (s === 'critical') return 'Crítica 🔴'
  if (s === 'high') return 'Alta 🟠'
  if (s === 'medium') return 'Média 🟡'
  if (s === 'low') return 'Baixa 🟢'
  return '—'
}

function inferCategory(text: string): string | undefined {
  const t = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (/\b(agua|vazamento|cano|abastecimento)\b/.test(t)) return 'Abastecimento de Água'
  if (/\b(arvore|galho|poda|verde|praca)\b/.test(t)) return 'Arborização e Meio Ambiente'
  if (/\b(calcada|pedestre|acessibilidade|rampa)\b/.test(t)) return 'Calçadas e Acessibilidade'
  if (/\b(alagamento|enchente|bueiro|inundacao|chuva)\b/.test(t)) return 'Drenagem e Alagamentos'
  if (/\b(esgoto|saneamento|fossa|catinga)\b/.test(t)) return 'Esgoto e Saneamento'
  if (/\b(iluminacao|poste|apagado|lampada|escuro)\b/.test(t)) return 'Iluminação Pública'
  if (/\b(lixo|entulho|sujeira|coleta)\b/.test(t)) return 'Resíduos Sólidos'
  if (/\b(seguranca|vandalismo|pichacao)\b/.test(t)) return 'Segurança Urbana / Espaço Público'
  if (/\b(semaforo|placa|faixa|sinalizacao)\b/.test(t)) return 'Sinalização de Trânsito'
  if (/\b(buraco|asfalto|cratera|pavimento|rua|pista)\b/.test(t)) return 'Vias e Pavimentação'
  return undefined
}

function inferSeverityFromText(text: string): IssueDraft['severity'] | undefined {
  const t = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (/\b(critica|urgente|perigo|grave|acidente|risco)\b/.test(t)) return 'critical'
  if (/\b(alta|ruim|preocupante)\b/.test(t)) return 'high'
  if (/\b(media|normal|regular)\b/.test(t)) return 'medium'
  if (/\b(baixa|leve|pouco)\b/.test(t)) return 'low'
  return undefined
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
      text: `Olá! Sou o Zé, assistente do Zela 👋 Sobre o que você quer falar? Pode me contar algum problema que está vendo na cidade!`,
    },
  ])
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<FlowStep>('idle')
  const [draft, setDraft] = useState<IssueDraft>({})
  const [isRecording, setIsRecording] = useState(false)
  const [micError, setMicError] = useState('')
  const [speechSupported, setSpeechSupported] = useState(false)
  const [locating, setLocating] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const recognitionRef = useRef<any>(null)
  // history for Groq (only used in idle step to detect intent)
  const historyRef = useRef<ChatHistoryMessage[]>([])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, step])

  // Speech recognition
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (SR) {
      setSpeechSupported(true)
      const rec = new SR()
      rec.lang = 'pt-BR'
      rec.continuous = false
      rec.interimResults = false
      rec.onstart = () => { setIsRecording(true); setMicError('') }
      rec.onend = () => setIsRecording(false)
      rec.onerror = () => { setMicError('Erro ao acessar o microfone.'); setIsRecording(false) }
      rec.onresult = (e: any) => setInput(e.results[0][0].transcript)
      recognitionRef.current = rec
    }
  }, [])

  const toggleRecording = () => {
    if (!recognitionRef.current) return
    isRecording ? recognitionRef.current.stop() : recognitionRef.current.start()
  }

  // Add message helper
  const addMsg = (role: 'assistant' | 'user', text: string) => {
    const msg: ChatMessage = { id: crypto.randomUUID(), role, text }
    setMessages(prev => [...prev, msg])
    return msg
  }

  // Use geolocation for location step
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      addMsg('assistant', 'Seu navegador não suporta geolocalização. Por favor, me diga o endereço ou bairro onde está o problema.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLocating(false)
        const { latitude, longitude } = pos.coords
        // Reverse geocode with nominatim
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=pt`
          )
          const data = await res.json()
          const road = data.address?.road || data.address?.pedestrian || ''
          const suburb = data.address?.suburb || data.address?.neighbourhood || ''
          const city_district = data.address?.city_district || ''
          const neighborhood = suburb || city_district || ''
          const address = road || 'Localização obtida pelo GPS'

          const locationText = `${road ? road + (neighborhood ? ', ' : '') : ''}${neighborhood}`

          addMsg('user', `📍 Localização: ${locationText || `Lat ${latitude.toFixed(4)}, Lon ${longitude.toFixed(4)}`}`)

          setDraft(prev => ({
            ...prev,
            address: address,
            neighborhood: neighborhood,
            coordinates: { lat: latitude, lng: longitude } as any,
          }))

          // Move to next step
          setTimeout(() => {
            addMsg('assistant', 'Ótimo, anotei a localização! Qual o nível de urgência desse problema? (baixa, média, alta ou crítica)')
            setStep('severity')
          }, 400)
        } catch {
          setLocating(false)
          const fallback = `Lat ${latitude.toFixed(5)}, Lon ${longitude.toFixed(5)}`
          addMsg('user', `📍 ${fallback}`)
          setDraft(prev => ({ ...prev, address: fallback }))
          setTimeout(() => {
            addMsg('assistant', 'Localizei! Qual o nível de urgência? (baixa, média, alta ou crítica)')
            setStep('severity')
          }, 400)
        }
      },
      () => {
        setLocating(false)
        addMsg('assistant', 'Não consegui acessar sua localização. Pode me dizer o endereço ou bairro onde está o problema?')
      }
    )
  }

  // Main send handler
  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || loading) return
    setInput('')

    addMsg('user', trimmed)

    // ─── STEP: idle — detect problem intent ───
    if (step === 'idle') {
      setLoading(true)
      historyRef.current = [...historyRef.current, { role: 'user', content: trimmed }]
      try {
        const response = await sendMessageToChatbot({
          userMessage: trimmed,
          history: historyRef.current,
          currentDraft: {},
          currentUserName,
        })
        historyRef.current = [...historyRef.current, { role: 'assistant', content: response.reply }]

        if (response.detectedIssue) {
          // Pre-fill what we can from this message
          const cat = response.issueData.category || inferCategory(trimmed)
          const sev = response.issueData.severity || inferSeverityFromText(trimmed)
          
          let polishedDesc = response.issueData.description || trimmed
          try {
            polishedDesc = await polishDescription(polishedDesc)
          } catch (e) {
            console.warn("Failed to polish description in idle:", e)
          }

          setDraft({
            category: cat,
            severity: sev,
            description: polishedDesc,
            address: response.issueData.address,
            neighborhood: response.issueData.neighborhood,
          })
          setLoading(false)
          setTimeout(() => {
            addMsg('assistant', 'Quer que eu te ajude a registrar essa ocorrência? 🗒️')
            setStep('confirm')
          }, 300)
        } else {
          addMsg('assistant', response.reply)
          setLoading(false)
        }
      } catch {
        // Fallback: just ask if they want to report
        setLoading(false)
        addMsg('assistant', 'Quer que eu te ajude a registrar essa ocorrência? 🗒️')
        setStep('confirm')
      }
      return
    }

    // ─── STEP: confirm ───
    if (step === 'confirm') {
      const yes = /\b(sim|s|quero|pode|claro|vai|vamos|ok|bora|certo|isso)\b/i.test(trimmed)
      const no = /\b(nao|não|n|agora nao|deixa|cancel)\b/i.test(trimmed)
      if (yes) {
        addMsg('assistant', 'Pode descrever com mais detalhes o que está acontecendo?')
        setStep('description')
      } else if (no) {
        addMsg('assistant', 'Tudo bem! Se precisar de alguma coisa, é só falar. 😊')
        setStep('idle')
      } else {
        addMsg('assistant', 'Pode me confirmar? Quer registrar essa ocorrência? (sim ou não)')
      }
      return
    }

    // ─── STEP: description ───
    if (step === 'description') {
      setLoading(true)
      const cat = draft.category || inferCategory(trimmed)
      
      let polished = trimmed
      try {
        polished = await polishDescription(trimmed)
      } catch (err) {
        console.warn("Error polishing description:", err)
      }

      setDraft(prev => ({ ...prev, description: polished, category: cat }))
      setLoading(false)
      addMsg('assistant', 'Entendido! Agora me diga onde está esse problema — pode usar o botão 📍 abaixo para detectar automaticamente, ou me diga o endereço e bairro.')
      setStep('location')
      return
    }

    // ─── STEP: location (text answer) ───
    if (step === 'location') {
      setDraft(prev => ({ ...prev, address: trimmed }))
      addMsg('assistant', 'Ótimo, anotei! Qual o nível de urgência desse problema? (baixa, média, alta ou crítica)')
      setStep('severity')
      return
    }

    // ─── STEP: severity ───
    if (step === 'severity') {
      const t = trimmed.toLowerCase()
      let sev: IssueDraft['severity'] = 'medium'
      if (/critica|critico|urgente|perigo/.test(t)) sev = 'critical'
      else if (/alta|alto|grave/.test(t)) sev = 'high'
      else if (/media|medio|normal/.test(t)) sev = 'medium'
      else if (/baixa|baixo|leve/.test(t)) sev = 'low'
      else {
        addMsg('assistant', 'Pode me dizer se é baixa, média, alta ou crítica?')
        return
      }
      setDraft(prev => ({ ...prev, severity: sev }))
      addMsg('assistant', 'Último detalhe: quer que seu nome apareça no relatório, ou prefere registrar de forma anônima?')
      setStep('anonymous')
      return
    }

    // ─── STEP: anonymous ───
    if (step === 'anonymous') {
      const t = trimmed.toLowerCase()
      const anon = /\b(anonimo|anonima|sem nome|prefiro|privado|nao aparecer|não aparecer)\b/.test(t)
      setDraft(prev => ({ ...prev, anonymous: anon }))

      // Build final title if not set
      setDraft(prev => {
        const finalDraft = { ...prev, anonymous: anon }
        if (!finalDraft.title) {
          const cat = finalDraft.category || 'Ocorrência'
          finalDraft.title = cat
        }
        return finalDraft
      })

      addMsg('assistant', 'Perfeito! Aqui está o resumo do que você relatou. Confere e me diz se quer publicar! 👇')
      setStep('review')
      return
    }
  }

  const handlePublish = () => {
    if (draft) {
      onStartReport(draft)
      onClose()
    }
  }

  const handleRestart = () => {
    setDraft({})
    setStep('idle')
    addMsg('assistant', 'Tudo bem! Se quiser relatar outra coisa, pode me contar.')
  }

  return (
    <div className="chat-panel">
      {/* Header */}
      <div className="chat-header">
        <div>
          <div className="chat-header-title-row">
            <h3 className="chat-title">Assistente Zé</h3>
            <span className="chat-status-dot"></span>
          </div>
          <p className="chat-subtitle">Online • Zela</p>
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
            <span>Pensando...</span>
          </div>
        )}

        {/* Location button — only shown on location step */}
        {step === 'location' && (
          <div className="chat-location-action">
            <button
              type="button"
              className="chat-location-btn"
              onClick={handleUseMyLocation}
              disabled={locating}
            >
              {locating ? <Loader2 size={15} className="spin" /> : <Navigation size={15} />}
              {locating ? 'Obtendo localização...' : 'Usar minha localização atual'}
            </button>
            <span className="chat-location-hint">ou escreva o endereço abaixo</span>
          </div>
        )}

        {/* Final review card — only shown on review step */}
        {step === 'review' && (
          <div className="chat-draft-card chat-draft-card--final">
            <div className="chat-draft-header">
              <Sparkles size={14} className="sparkle-icon" />
              <span>Resumo da Ocorrência</span>
            </div>
            <div className="chat-draft-details">
              <div className="chat-draft-field">
                <strong>Descrição:</strong>
                <span>{draft.description || '—'}</span>
              </div>
              <div className="chat-draft-field">
                <strong>Categoria:</strong>
                <span>{draft.category || '—'}</span>
              </div>
              <div className="chat-draft-field">
                <strong>Local:</strong>
                <span>{[draft.address, draft.neighborhood].filter(Boolean).join(', ') || '—'}</span>
              </div>
              <div className="chat-draft-field">
                <strong>Urgência:</strong>
                <span>{severityLabel(draft.severity)}</span>
              </div>
              <div className="chat-draft-field">
                <strong>Identificação:</strong>
                <span>{draft.anonymous ? 'Anônimo' : 'Com meu nome'}</span>
              </div>
            </div>
            <div className="chat-draft-actions">
              <button type="button" className="chat-draft-submit-btn" onClick={handlePublish}>
                <CheckCircle2 size={14} />
                <span>Publicar ocorrência</span>
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

      {/* Input row — hidden during review */}
      {step !== 'review' && (
        <>
          <div className="chat-input-row">
            <input
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isRecording ? 'Ouvindo...' : step === 'location' ? 'Ex: Rua das Flores, Nazaré...' : 'Digite sua resposta...'}
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
            {speechSupported ? 'Você pode digitar ou usar a voz para responder.' : ''}
          </div>
        </>
      )}

      {/* When review, show restart option */}
      {step === 'review' && (
        <div className="chat-mic-help" style={{ textAlign: 'center', padding: '12px 16px' }}>
          Revise os dados acima e publique quando estiver pronto.
        </div>
      )}
    </div>
  )
}