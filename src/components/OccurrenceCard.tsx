import { useState } from 'react'
import { Clock3, MapPin, ThumbsUp, ChevronDown, ChevronRight, Trash2, Pencil, Check, X as XIcon } from 'lucide-react'
import type { Occurrence } from '../types/occurrence'
import OccurrenceDetailModal from './OccurrenceDetailModal'

interface OccurrenceCardProps {
  occurrence: Occurrence
  onSupport: (id: string) => void
  isSupported?: boolean
  isAdmin?: boolean
  onChangeStatus?: (id: string, status: Occurrence['status']) => void
  onDelete?: (id: string) => void
  onEdit?: (id: string, title: string, description: string) => void
  onSaveNote?: (id: string, note: string) => void
  theme?: 'light' | 'dark'
}

function getTimeAgo(dateString: string) {
  const now = new Date()
  const created = new Date(dateString)
  const diffMs = now.getTime() - created.getTime()
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))

  if (diffDays === 0) return 'Hoje'
  if (diffDays === 1) return '1 dia atrás'
  return `${diffDays} dias atrás`
}

function getStatusClass(status: string) {
  if (status === 'aberta') return 'aberta'
  if (status === 'em análise') return 'em-analise'
  return 'resolvida'
}

function OccurrenceCard({
  occurrence,
  onSupport,
  isSupported,
  isAdmin,
  onChangeStatus,
  onDelete,
  onEdit,
  onSaveNote,
  theme = 'dark',
}: OccurrenceCardProps) {
  const [detailOpen, setDetailOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(occurrence.title)
  const [editDescription, setEditDescription] = useState(occurrence.description)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function handleSaveEdit(e: React.MouseEvent) {
    e.stopPropagation()
    onEdit?.(occurrence.id, editTitle.trim() || occurrence.title, editDescription.trim())
    setEditing(false)
  }

  function handleCancelEdit(e: React.MouseEvent) {
    e.stopPropagation()
    setEditTitle(occurrence.title)
    setEditDescription(occurrence.description)
    setEditing(false)
  }

  function handleDeleteClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (confirmDelete) {
      onDelete?.(occurrence.id)
    } else {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 3000)
    }
  }

  const isDark = theme === 'dark'
  const inputBg = isDark ? '#1e1e28' : '#f0f0f5'
  const inputColor = isDark ? '#f0f0f5' : '#111827'
  const inputBorder = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'

  return (
    <>
      <div
        className="occurrence-card"
        style={{ cursor: editing ? 'default' : 'pointer', transition: 'transform 0.15s, box-shadow 0.15s' }}
        onClick={() => !editing && setDetailOpen(true)}
        onMouseEnter={(e) => { if (!editing) (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)' }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' && !editing) setDetailOpen(true) }}
        aria-label={`Ver detalhes: ${occurrence.title}`}
      >
        <div className="occurrence-card-top">
          <div className="occurrence-main" style={{ flex: 1 }}>
            {editing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                <input
                  autoFocus
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    padding: '6px 10px',
                    borderRadius: 8,
                    border: `1px solid ${inputBorder}`,
                    background: inputBg,
                    color: inputColor,
                    outline: 'none',
                    width: '100%',
                  }}
                  placeholder="Título"
                />
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={2}
                  style={{
                    fontSize: 12,
                    padding: '6px 10px',
                    borderRadius: 8,
                    border: `1px solid ${inputBorder}`,
                    background: inputBg,
                    color: inputColor,
                    outline: 'none',
                    resize: 'vertical',
                    width: '100%',
                    fontFamily: 'inherit',
                  }}
                  placeholder="Descrição"
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={handleSaveEdit}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                      background: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer',
                    }}
                  >
                    <Check size={12} /> Salvar
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                      background: 'transparent', color: '#8888a0',
                      border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
                    }}
                  >
                    <XIcon size={12} /> Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h3 className="occurrence-title">{occurrence.title}</h3>
                <p className="occurrence-description">{occurrence.description}</p>
              </>
            )}
          </div>

          <div className="occurrence-badges">
            {isAdmin && onChangeStatus ? (
              <div
                className="admin-status-select-wrapper"
                onClick={(e) => e.stopPropagation()}
              >
                <select
                  className={`admin-status-select admin-status-select--${getStatusClass(occurrence.status)}`}
                  value={occurrence.status}
                  onChange={(e) => onChangeStatus(occurrence.id, e.target.value as Occurrence['status'])}
                >
                  <option value="aberta">aberta</option>
                  <option value="em análise">em análise</option>
                  <option value="resolvida">resolvida</option>
                </select>
                <ChevronDown size={11} className="admin-status-chevron" />
              </div>
            ) : (
              <span className={`status-badge status-badge--${occurrence.status.replace(' ', '-')}`}>
                {occurrence.status}
              </span>
            )}
            <span className={`severity-badge severity-badge--${occurrence.severity}`}>
              Severidade {occurrence.severity}
            </span>
          </div>
        </div>

        <div className="occurrence-meta">
          <span>
            <MapPin size={14} />
            {occurrence.neighborhood}
          </span>

          <span>
            <Clock3 size={14} />
            {getTimeAgo(occurrence.createdAt)}
          </span>
        </div>

        {/* Admin action row — shown only for admins, above the main footer */}
        {isAdmin && !editing && (
          <div className="occurrence-admin-actions" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={(e) => { e.stopPropagation(); setEditing(true) }}
              title="Editar ocorrência"
              className="occurrence-admin-btn occurrence-admin-btn--edit"
            >
              <Pencil size={11} /> Editar
            </button>
            <button
              onClick={handleDeleteClick}
              title={confirmDelete ? 'Clique novamente para confirmar' : 'Excluir ocorrência'}
              className={`occurrence-admin-btn occurrence-admin-btn--delete${confirmDelete ? ' confirming' : ''}`}
            >
              <Trash2 size={11} />
              {confirmDelete ? 'Confirmar?' : 'Excluir'}
            </button>
          </div>
        )}

        <div className="occurrence-footer">
          <span className="category-badge">{occurrence.category}</span>

          <div className="occurrence-footer-actions">
            <button
              className={`support-button${isSupported ? ' supported' : ''}`}
              onClick={(e) => { e.stopPropagation(); onSupport(occurrence.id) }}
              disabled={isAdmin}
              style={{ opacity: isAdmin ? 0.5 : 1, cursor: isAdmin ? 'not-allowed' : 'pointer' }}
            >
              <ThumbsUp size={14} />
              {isSupported ? 'Apoiado' : 'Apoiar'}
              <span className="support-count">{occurrence.supportCount}</span>
            </button>

            <button
              className="occurrence-details-btn"
              onClick={(e) => { e.stopPropagation(); setDetailOpen(true) }}
            >
              Detalhes
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      </div>

      {detailOpen && (
        <OccurrenceDetailModal
          occurrence={occurrence}
          onClose={() => setDetailOpen(false)}
          onSupport={onSupport}
          isSupported={!!isSupported}
          isAdmin={isAdmin}
          onChangeStatus={onChangeStatus}
          onDelete={onDelete}
          onEdit={onEdit}
          onSaveNote={onSaveNote}
          theme={theme}
        />
      )}
    </>
  )
}

export default OccurrenceCard