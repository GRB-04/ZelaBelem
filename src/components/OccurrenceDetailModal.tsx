import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import {
  X,
  MapPin,
  Tag,
  AlertTriangle,
  ThumbsUp,
  Share2,
  CheckCircle2,
  Shield,
  User,
  Calendar,
  Navigation,
  ChevronDown,
  ImageOff,
  Pencil,
  Trash2,
  MessageSquarePlus,
  Save,
} from 'lucide-react'
import type { Occurrence } from '../types/occurrence'

// Custom map pin
const pinIcon = L.divIcon({
  html: `
    <div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-12px)">
      <svg width="28" height="34" viewBox="0 0 24 30" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0px 3px 6px rgba(0,0,0,0.45))">
        <path d="M12 0C5.37 0 0 5.37 0 12C0 21 12 30 12 30C12 30 24 21 24 12C24 5.37 18.63 0 12 0Z" fill="#007aff"/>
        <circle cx="12" cy="12" r="5" fill="white"/>
      </svg>
    </div>
  `,
  className: 'custom-leaflet-marker',
  iconSize: [28, 34],
  iconAnchor: [14, 34],
})

interface OccurrenceDetailModalProps {
  occurrence: Occurrence
  onClose: () => void
  onSupport: (id: string) => void
  isSupported: boolean
  isAdmin?: boolean
  onChangeStatus?: (id: string, status: Occurrence['status']) => void
  onDelete?: (id: string) => void
  onEdit?: (id: string, title: string, description: string) => void
  onSaveNote?: (id: string, note: string) => void
  theme?: 'light' | 'dark'
}

const STATUS_LABELS: Record<Occurrence['status'], string> = {
  'aberta': 'Aberta',
  'em análise': 'Em análise',
  'resolvida': 'Resolvida',
}

const SEVERITY_LABELS: Record<Occurrence['severity'], string> = {
  'baixa': 'Baixa',
  'média': 'Média',
  'alta': 'Alta',
}

const SEVERITY_COLORS: Record<Occurrence['severity'], string> = {
  'baixa': '#34d399',
  'média': '#fbbf24',
  'alta': '#f87171',
}

const STATUS_COLORS: Record<Occurrence['status'], string> = {
  'aberta': '#818cf8',
  'em análise': '#fbbf24',
  'resolvida': '#4ade80',
}

function getStatusBg(status: Occurrence['status']): string {
  if (status === 'aberta') return 'rgba(99,102,241,0.15)'
  if (status === 'em análise') return 'rgba(245,158,11,0.15)'
  return 'rgba(34,197,94,0.15)'
}

function formatDate(dateStr: string) {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateStr))
  } catch {
    return dateStr
  }
}

function getStatusClass(status: string) {
  if (status === 'aberta') return 'aberta'
  if (status === 'em análise') return 'em-analise'
  return 'resolvida'
}

export default function OccurrenceDetailModal({
  occurrence,
  onClose,
  onSupport,
  isSupported,
  isAdmin = false,
  onChangeStatus,
  onDelete,
  onEdit,
  onSaveNote,
  theme = 'dark',
}: OccurrenceDetailModalProps) {
  const isDark = theme === 'dark'
  const [copied, setCopied] = useState(false)
  const [imgError, setImgError] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)

  // Admin state
  const [editingFields, setEditingFields] = useState(false)
  const [editTitle, setEditTitle] = useState(occurrence.title)
  const [editDescription, setEditDescription] = useState(occurrence.description)
  const [adminNote, setAdminNote] = useState(occurrence.adminNote ?? '')
  const [editingNote, setEditingNote] = useState(false)
  const [noteSaved, setNoteSaved] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function handleSaveEdit() {
    onEdit?.(occurrence.id, editTitle.trim() || occurrence.title, editDescription.trim())
    setEditingFields(false)
  }

  function handleSaveNote() {
    onSaveNote?.(occurrence.id, adminNote)
    setEditingNote(false)
    setNoteSaved(true)
    setTimeout(() => setNoteSaved(false), 2500)
  }

  function handleDeleteClick() {
    if (confirmDelete) {
      onDelete?.(occurrence.id)
      onClose()
    } else {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 3500)
    }
  }

  const hasCoords =
    typeof occurrence.latitude === 'number' &&
    typeof occurrence.longitude === 'number' &&
    !isNaN(occurrence.latitude) &&
    !isNaN(occurrence.longitude) &&
    occurrence.latitude !== 0 &&
    occurrence.longitude !== 0

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])


  function handleShare() {
    const text = `📍 Ocorrência em ${occurrence.neighborhood}: ${occurrence.title}\n${occurrence.description}\n\nRegistrado no Zela`
    if (navigator.share) {
      navigator.share({ title: occurrence.title, text }).catch(() => {})
    } else {
      navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const bg = isDark ? '#141418' : '#ffffff'
  const surface = isDark ? '#1e1e24' : '#f8f8fa'
  const border = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'
  const text = isDark ? '#f0f0f5' : '#111827'
  const muted = isDark ? '#8888a0' : '#6b7280'

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        backgroundColor: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        overflowY: 'auto',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={modalRef}
        style={{
          width: '100%',
          maxWidth: 680,
          background: bg,
          border: `1px solid ${border}`,
          borderRadius: 24,
          overflow: 'hidden',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          overflowY: 'auto',
          /* Impede que o scroll dentro da modal vaze para a página */
          overscrollBehavior: 'contain',
          animation: 'slideUpFade 0.25s ease',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Hero: Photo or Map ──────────────────────────────── */}
        <div style={{ position: 'relative', height: 240, flexShrink: 0, background: isDark ? '#0e0e14' : '#e8ecf0', overflow: 'hidden' }}>
          {occurrence.imageUrl && !imgError ? (
            <img
              src={occurrence.imageUrl}
              alt="Foto da ocorrência"
              onError={() => setImgError(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : hasCoords ? (
            <MapContainer
              center={[occurrence.latitude, occurrence.longitude]}
              zoom={16}
              zoomControl={false}
              scrollWheelZoom={false}
              dragging={false}
              attributionControl={false}
              style={{ width: '100%', height: '100%' }}
            >
              <TileLayer
                url={isDark
                  ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                  : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
                }
              />
              <Marker position={[occurrence.latitude, occurrence.longitude]} icon={pinIcon} />
            </MapContainer>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8, color: muted }}>
              <ImageOff size={36} strokeWidth={1.5} />
              <span style={{ fontSize: 13 }}>Sem imagem ou localização</span>
            </div>
          )}

          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: 14,
              right: 14,
              width: 36,
              height: 36,
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(6px)',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
            }}
            aria-label="Fechar"
          >
            <X size={16} />
          </button>

          {/* If both photo AND coords exist, show map overlay toggle */}
          {occurrence.imageUrl && !imgError && hasCoords && (
            <a
              href={`https://maps.google.com/?q=${occurrence.latitude},${occurrence.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                position: 'absolute',
                bottom: 14,
                right: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 20,
                background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(6px)',
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
                textDecoration: 'none',
                zIndex: 10,
              }}
            >
              <Navigation size={12} />
              Ver no mapa
            </a>
          )}
        </div>

        {/* ── Body ──────────────────────────────────────────── */}
        <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Title + Admin status control */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: text, lineHeight: 1.3 }}>
                {occurrence.title}
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: muted }}>
                {occurrence.anonymous ? '👤 Anônimo' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><User size={12} /> Cidadão identificado</span>}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
              {isAdmin && onChangeStatus ? (
                <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                  <select
                    className={`admin-status-select admin-status-select--${getStatusClass(occurrence.status)}`}
                    value={occurrence.status}
                    onChange={(e) => onChangeStatus(occurrence.id, e.target.value as Occurrence['status'])}
                    style={{ fontSize: 13, padding: '6px 28px 6px 12px' }}
                  >
                    <option value="aberta">Aberta</option>
                    <option value="em análise">Em análise</option>
                    <option value="resolvida">Resolvida</option>
                  </select>
                  <ChevronDown size={12} className="admin-status-chevron" />
                </div>
              ) : (
                <span style={{
                  padding: '5px 14px',
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 700,
                  background: getStatusBg(occurrence.status),
                  color: STATUS_COLORS[occurrence.status],
                  border: `1px solid ${STATUS_COLORS[occurrence.status]}40`,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}>
                  {STATUS_LABELS[occurrence.status]}
                </span>
              )}
              {isAdmin && (
                <span style={{ fontSize: 11, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Shield size={11} /> Modo Admin
                </span>
              )}
            </div>
          </div>

          {/* Description */}
          <div style={{ background: surface, borderRadius: 14, padding: '16px 18px', border: `1px solid ${border}` }}>
            <p style={{ margin: 0, fontSize: 14, color: text, lineHeight: 1.65 }}>
              {occurrence.description || <span style={{ color: muted, fontStyle: 'italic' }}>Sem descrição fornecida.</span>}
            </p>
          </div>

          {/* Metadata grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
          }}>
            <InfoTile icon={<Tag size={14} />} label="Categoria" value={occurrence.category} isDark={isDark} />
            <InfoTile
              icon={<AlertTriangle size={14} />}
              label="Urgência"
              value={SEVERITY_LABELS[occurrence.severity]}
              valueColor={SEVERITY_COLORS[occurrence.severity]}
              isDark={isDark}
            />
            <InfoTile icon={<MapPin size={14} />} label="Bairro" value={occurrence.neighborhood} isDark={isDark} />
            <InfoTile icon={<Calendar size={14} />} label="Registrado em" value={formatDate(occurrence.createdAt)} isDark={isDark} />
          </div>

          {/* Full address */}
          {occurrence.address && (
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              background: surface,
              borderRadius: 14,
              padding: '14px 18px',
              border: `1px solid ${border}`,
            }}>
              <MapPin size={16} style={{ color: '#007aff', flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 11, color: muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Endereço completo</div>
                <div style={{ fontSize: 14, color: text, fontWeight: 500 }}>{occurrence.address}</div>
                {hasCoords && (
                  <div style={{ fontSize: 12, color: muted, marginTop: 4 }}>
                    {occurrence.latitude.toFixed(5)}, {occurrence.longitude.toFixed(5)}
                    {' '}·{' '}
                    <a
                      href={`https://maps.google.com/?q=${occurrence.latitude},${occurrence.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#007aff', textDecoration: 'none', fontWeight: 500 }}
                    >
                      Abrir no Google Maps ↗
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Map (full size) — shown below if there's a photo on top */}
          {occurrence.imageUrl && !imgError && hasCoords && (
            <div style={{ borderRadius: 16, overflow: 'hidden', height: 200, border: `1px solid ${border}` }}>
              <MapContainer
                center={[occurrence.latitude, occurrence.longitude]}
                zoom={16}
                zoomControl={false}
                scrollWheelZoom={false}
                dragging={false}
                attributionControl={false}
                style={{ width: '100%', height: '100%' }}
              >
                <TileLayer
                  url={isDark
                    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
                  }
                />
                <Marker position={[occurrence.latitude, occurrence.longitude]} icon={pinIcon} />
              </MapContainer>
            </div>
          )}

          {/* Admin note — visible to everyone */}
          {occurrence.adminNote && (
            <div style={{
              background: 'rgba(34,197,94,0.07)',
              border: '1px solid rgba(34,197,94,0.22)',
              borderRadius: 14,
              padding: '14px 18px',
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
            }}>
              <Shield size={15} style={{ color: '#4ade80', flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 11, color: '#4ade80', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                  Resposta oficial da prefeitura
                </div>
                <div style={{ fontSize: 13, color: text, lineHeight: 1.55 }}>{occurrence.adminNote}</div>
              </div>
            </div>
          )}

          {/* Admin panel */}
          {isAdmin && (
            <div style={{
              background: 'rgba(245,158,11,0.06)',
              border: '1px solid rgba(245,158,11,0.18)',
              borderRadius: 16,
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#f59e0b' }}>
                  <Shield size={14} />
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Painel do Administrador</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {!editingFields && (
                    <button
                      onClick={() => { setEditingFields(true); setEditTitle(occurrence.title); setEditDescription(occurrence.description) }}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px',
                        borderRadius: 20, fontSize: 12, fontWeight: 600,
                        background: 'rgba(99,102,241,0.15)', color: '#818cf8',
                        border: '1px solid rgba(99,102,241,0.3)', cursor: 'pointer',
                      }}
                    >
                      <Pencil size={11} /> Editar
                    </button>
                  )}
                  <button
                    onClick={handleDeleteClick}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px',
                      borderRadius: 20, fontSize: 12, fontWeight: 600,
                      background: confirmDelete ? 'rgba(239,68,68,0.25)' : 'rgba(239,68,68,0.1)',
                      color: '#f87171',
                      border: confirmDelete ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(239,68,68,0.25)',
                      cursor: 'pointer', transition: 'all 0.2s',
                    }}
                  >
                    <Trash2 size={11} />
                    {confirmDelete ? 'Confirmar exclusão?' : 'Excluir'}
                  </button>
                </div>
              </div>

              {/* Inline edit fields */}
              {editingFields && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input
                    autoFocus
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    style={{
                      fontSize: 14, fontWeight: 600, padding: '8px 12px',
                      borderRadius: 10, border: `1px solid rgba(245,158,11,0.3)`,
                      background: isDark ? '#1e1e28' : '#f5f5f0',
                      color: isDark ? '#f0f0f5' : '#111827', outline: 'none', width: '100%',
                    }}
                    placeholder="Título"
                  />
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={3}
                    style={{
                      fontSize: 13, padding: '8px 12px',
                      borderRadius: 10, border: `1px solid rgba(245,158,11,0.3)`,
                      background: isDark ? '#1e1e28' : '#f5f5f0',
                      color: isDark ? '#f0f0f5' : '#111827', outline: 'none',
                      resize: 'vertical', width: '100%', fontFamily: 'inherit',
                    }}
                    placeholder="Descrição"
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={handleSaveEdit}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 16px',
                        borderRadius: 10, fontSize: 13, fontWeight: 600,
                        background: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer',
                      }}
                    >
                      <Save size={13} /> Salvar alterações
                    </button>
                    <button
                      onClick={() => setEditingFields(false)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px',
                        borderRadius: 10, fontSize: 13, fontWeight: 500,
                        background: 'transparent', color: '#8888a0',
                        border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
                      }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {/* Admin note */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#f59e0b' }}>
                  <MessageSquarePlus size={13} />
                  <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Nota oficial (visível ao público)</span>
                </div>
                {editingNote ? (
                  <>
                    <textarea
                      autoFocus
                      value={adminNote}
                      onChange={(e) => setAdminNote(e.target.value)}
                      rows={3}
                      placeholder="Ex: Equipe de manutenção acionada. Prazo estimado: 5 dias úteis."
                      style={{
                        fontSize: 13, padding: '10px 14px',
                        borderRadius: 10, border: '1px solid rgba(245,158,11,0.35)',
                        background: isDark ? '#1e1e28' : '#f5f5f0',
                        color: isDark ? '#f0f0f5' : '#111827', outline: 'none',
                        resize: 'vertical', width: '100%', fontFamily: 'inherit',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={handleSaveNote}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 16px',
                          borderRadius: 10, fontSize: 13, fontWeight: 600,
                          background: '#f59e0b', color: '#000', border: 'none', cursor: 'pointer',
                        }}
                      >
                        <Save size={13} /> Publicar nota
                      </button>
                      <button
                        onClick={() => { setEditingNote(false); setAdminNote(occurrence.adminNote ?? '') }}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px',
                          borderRadius: 10, fontSize: 13, fontWeight: 500,
                          background: 'transparent', color: '#8888a0',
                          border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
                        }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </>
                ) : (
                  <div
                    onClick={() => setEditingNote(true)}
                    style={{
                      minHeight: 48, padding: '10px 14px',
                      borderRadius: 10, border: '1px dashed rgba(245,158,11,0.3)',
                      background: isDark ? 'rgba(245,158,11,0.04)' : 'rgba(245,158,11,0.04)',
                      cursor: 'pointer', fontSize: 13,
                      color: adminNote ? (isDark ? '#f0f0f5' : '#111827') : '#8888a0',
                      fontStyle: adminNote ? 'normal' : 'italic',
                      lineHeight: 1.5,
                    }}
                  >
                    {noteSaved
                      ? <span style={{ color: '#4ade80' }}>✓ Nota salva com sucesso!</span>
                      : adminNote || 'Clique para adicionar uma resposta oficial…'}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            <button
              onClick={() => onSupport(occurrence.id)}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '13px 20px',
                borderRadius: 14,
                border: isSupported ? '1px solid rgba(0,122,255,0.4)' : `1px solid ${border}`,
                background: isSupported ? 'rgba(0,122,255,0.15)' : surface,
                color: isSupported ? '#007aff' : text,
                fontWeight: 600,
                fontSize: 14,
                cursor: isAdmin ? 'not-allowed' : 'pointer',
                opacity: isAdmin ? 0.5 : 1,
                transition: 'all 0.2s',
              }}
              disabled={isAdmin}
              title={isAdmin ? 'Administradores não apoiam ocorrências' : undefined}
            >
              {isSupported ? <CheckCircle2 size={16} /> : <ThumbsUp size={16} />}
              {isSupported ? 'Apoiado' : 'Apoiar'}
              <span style={{
                background: isSupported ? 'rgba(0,122,255,0.2)' : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'),
                borderRadius: 20,
                padding: '1px 8px',
                fontSize: 12,
                fontWeight: 700,
              }}>
                {occurrence.supportCount}
              </span>
            </button>

            <button
              onClick={handleShare}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '13px 20px',
                borderRadius: 14,
                border: `1px solid ${border}`,
                background: surface,
                color: copied ? '#4ade80' : text,
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
                transition: 'all 0.2s',
                minWidth: 120,
              }}
            >
              {copied ? <CheckCircle2 size={16} /> : <Share2 size={16} />}
              {copied ? 'Copiado!' : 'Compartilhar'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Tile component ─────────────────────────────────────────────────────────
interface InfoTileProps {
  icon: React.ReactNode
  label: string
  value: string
  valueColor?: string
  isDark: boolean
}

function InfoTile({ icon, label, value, valueColor, isDark }: InfoTileProps) {
  const surface = isDark ? '#1e1e24' : '#f8f8fa'
  const border = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'
  const text = isDark ? '#f0f0f5' : '#111827'
  const muted = isDark ? '#8888a0' : '#6b7280'

  return (
    <div style={{
      background: surface,
      border: `1px solid ${border}`,
      borderRadius: 14,
      padding: '12px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: muted }}>
        {icon}
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: valueColor ?? text }}>{value || '—'}</div>
    </div>
  )
}
