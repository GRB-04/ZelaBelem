import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Clock3,
  Download,
  MapPinned,
  MessageCircle,
  Plus,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
} from 'lucide-react'
import TopBar from '../components/TopBar'
import MetricCard from '../components/MetricCard'
import OccurrenceList from '../components/OccurrenceList'
import OccurrenceMap from '../components/OccurrenceMap'
import ReportIssueModal from '../components/ReportIssueModal'
import OccurrenceDetailModal from '../components/OccurrenceDetailModal'
import UrbanAssistantChat from '../components/UrbanAssistantChat'
import { mockOccurrences } from '../data/mockOccurrences'
import type { Occurrence } from '../types/occurrence'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import type { AdminSession } from '../lib/adminSession'

interface DbIssue {
  id: string | number
  title: string
  description?: string | null
  category: string
  status?: string | null
  severity?: string | null
  neighborhood?: string | null
  address?: string | null
  lat: number | string
  lng: number | string
  created_at: string
  anonymous?: boolean | null
  photo_url?: string | null
  admin_note?: string | null
}

function getMostFrequentCategory(occurrences: Occurrence[]) {
  const counter = new Map<string, number>()

  occurrences.forEach((item) => {
    counter.set(item.category, (counter.get(item.category) ?? 0) + 1)
  })

  return [...counter.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'
}

function getTopNeighborhood(occurrences: Occurrence[]) {
  const counter = new Map<string, number>()

  occurrences.forEach((item) => {
    counter.set(item.neighborhood, (counter.get(item.neighborhood) ?? 0) + 1)
  })

  return [...counter.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'
}

function getAverageResolutionDays(occurrences: Occurrence[]) {
  const resolved = occurrences.filter((item) => item.status === 'resolvida')
  if (resolved.length === 0) return 0

  const totalDays = resolved.reduce((sum, item) => {
    const created = new Date(item.createdAt)
    const resolvedDate = new Date()
    const diff = Math.max(
      1,
      Math.floor((resolvedDate.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)),
    )
    return sum + diff
  }, 0)

  return Math.round(totalDays / resolved.length)
}

interface DashboardProps {
  session?: { user?: { id?: string; email?: string; user_metadata?: Record<string, unknown> } } | null
  adminSession?: AdminSession | null
  onAdminLogout?: () => void
  onCitizenLogout?: () => void
}

function Dashboard({ session, adminSession, onAdminLogout, onCitizenLogout }: DashboardProps) {
  const isAdmin = !!(adminSession?.isAdmin)
  const currentUserId = session?.user?.id ?? null

  const [search, setSearch] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [occurrences, setOccurrences] = useState<Occurrence[]>([])
  const [votedByMe, setVotedByMe] = useState<Set<string>>(new Set())
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  const [prefilledData, setPrefilledData] = useState<Partial<Occurrence> | Record<string, unknown> | null>(null)
  const [selectedMapOccurrence, setSelectedMapOccurrence] = useState<Occurrence | null>(null)

  // ─── Admin exclusive filter states ─────────────────────────────────────────
  const [adminStatusFilter, setAdminStatusFilter] = useState<'todos' | Occurrence['status']>('todos')
  const [adminSeverityFilter, setAdminSeverityFilter] = useState<'todas' | Occurrence['severity']>('todas')
  const [adminNeighborhoodFilter, setAdminNeighborhoodFilter] = useState<string>('todos')
  const [adminCategoryFilter, setAdminCategoryFilter] = useState<string>('todas')
  const [adminSortBy, setAdminSortBy] = useState<'recentes' | 'antigas' | 'apoios'>('recentes')

  const currentUserName = useMemo(() => {
    if (isAdmin) return 'Administrador'
    if (!session?.user) return 'Convidado'
    const metadata = (session.user.user_metadata ?? {}) as Record<string, unknown>
    const fullName =
      (metadata.full_name as string) ||
      (metadata.name as string) ||
      (metadata.nome as string) ||
      session.user.email?.split('@')[0] ||
      'Gabriel'
    return String(fullName).trim().split(' ')[0]
  }, [session, isAdmin])

  async function handleLogout() {
    if (isAdmin && onAdminLogout) {
      onAdminLogout()
      return
    }
    if (onCitizenLogout) {
      onCitizenLogout()
      return
    }
    if (isSupabaseConfigured) {
      await supabase!.auth.signOut()
    } else {
      window.location.reload()
    }
  }

  const loadMockData = useCallback(() => {
    const localVotes = localStorage.getItem('zelabelem_votes')
    const votesSet = localVotes ? new Set<string>(JSON.parse(localVotes)) : new Set<string>()

    const localCounts = localStorage.getItem('zelabelem_vote_counts')
    const countsMap: Record<string, number> = localCounts ? JSON.parse(localCounts) : {}

    // Load persisted status overrides from admin
    const savedStatuses = localStorage.getItem('zelabelem_status_overrides')
    const statusOverrides: Record<string, Occurrence['status']> = savedStatuses
      ? JSON.parse(savedStatuses)
      : {}

    // Load persisted admin notes
    let adminNotesMap: Record<string, string> = {}
    try {
      const savedNotes = localStorage.getItem('zelabelem_admin_notes')
      if (savedNotes) adminNotesMap = JSON.parse(savedNotes)
    } catch { /* ignore */ }

    // Load persisted edits (title / description)
    let editsMap: Record<string, { title?: string; description?: string }> = {}
    try {
      const savedEdits = localStorage.getItem('zelabelem_occurrence_edits')
      if (savedEdits) editsMap = JSON.parse(savedEdits)
    } catch { /* ignore */ }

    // Load deleted IDs
    let deletedSet = new Set<string>()
    try {
      const savedDeleted = localStorage.getItem('zelabelem_deleted_ids')
      if (savedDeleted) deletedSet = new Set(JSON.parse(savedDeleted))
    } catch { /* ignore */ }

    // Load locally created occurrences by user in demo
    let localCreated: Occurrence[] = []
    try {
      const savedLocal = localStorage.getItem('zelabelem_local_occurrences')
      if (savedLocal) {
        localCreated = JSON.parse(savedLocal)
      }
    } catch (e) {
      console.warn('Erro ao carregar zelabelem_local_occurrences:', e)
    }

    const allOccurrences = [...localCreated, ...mockOccurrences].filter((item) => !deletedSet.has(item.id))

    const loaded = allOccurrences.map((item) => {
      const added = votesSet.has(item.id) ? 1 : 0
      const baseCount = countsMap[item.id] !== undefined ? countsMap[item.id] : item.supportCount
      const edited = editsMap[item.id]
      return {
        ...item,
        title: edited?.title ?? item.title,
        description: edited?.description ?? item.description,
        supportCount: Math.max(0, baseCount + added),
        // Apply status override if admin changed it
        status: statusOverrides[item.id] ?? item.status,
        // Apply admin note if saved
        adminNote: adminNotesMap[item.id] ?? item.adminNote,
      }
    })

    setOccurrences(loaded)
    setVotedByMe(votesSet)
  }, [])

  const loadData = useCallback(async () => {
    if (isSupabaseConfigured) {
      try {
        const { data: dbIssues, error: issuesError } = await supabase!
          .from('issues')
          .select('*')
          .order('created_at', { ascending: false })

        if (issuesError) throw issuesError

        const { data: dbVoteCounts, error: votesError } = await supabase!
          .from('issue_vote_counts')
          .select('issue_id, count')

        const votesMap: Record<string, number> = {}
        if (!votesError && dbVoteCounts) {
          dbVoteCounts.forEach((row: { issue_id: string | number; count?: number | null }) => {
            votesMap[String(row.issue_id)] = Number(row.count ?? 0)
          })
        }

        const votesSet = new Set<string>()
        if (currentUserId) {
          const { data: dbUserVotes } = await supabase!
            .from('issue_votes')
            .select('issue_id')
            .eq('user_id', currentUserId)

          if (dbUserVotes) {
            dbUserVotes.forEach((row: { issue_id: string | number }) => {
              votesSet.add(String(row.issue_id))
            })
          }
        }

        // Local notes fallback if column isn't in db yet
        let adminNotesMap: Record<string, string> = {}
        try {
          const savedNotes = localStorage.getItem('zelabelem_admin_notes')
          if (savedNotes) adminNotesMap = JSON.parse(savedNotes)
        } catch { /* ignore */ }

        const mapped: Occurrence[] = ((dbIssues as DbIssue[]) ?? []).map((db: DbIssue) => {
          let statusStr: 'aberta' | 'em análise' | 'resolvida' = 'aberta'
          const dbStatus = String(db.status ?? '').toLowerCase().trim()
          if (dbStatus === 'resolvido' || dbStatus === 'resolvida') statusStr = 'resolvida'
          else if (dbStatus === 'em_analise' || dbStatus === 'em análise' || dbStatus === 'analise') statusStr = 'em análise'

          let sevStr: 'baixa' | 'média' | 'alta' = 'baixa'
          const dbSev = String(db.severity ?? '').toLowerCase().trim()
          if (dbSev === 'critical' || dbSev === 'high' || dbSev === 'alta') sevStr = 'alta'
          else if (dbSev === 'medium' || dbSev === 'média') sevStr = 'média'

          return {
            id: String(db.id),
            title: db.title,
            description: db.description ?? '',
            category: db.category,
            status: statusStr,
            severity: sevStr,
            neighborhood: db.neighborhood ?? 'Belém',
            address: db.address ?? '',
            latitude: Number(db.lat),
            longitude: Number(db.lng),
            createdAt: db.created_at,
            supportCount: votesMap[String(db.id)] ?? 0,
            anonymous: db.anonymous ?? false,
            imageUrl: db.photo_url ?? undefined,
            adminNote: db.admin_note || adminNotesMap[String(db.id)] || undefined,
          }
        })

        setOccurrences(mapped)
        setVotedByMe(votesSet)
      } catch (err) {
        console.error('Erro ao carregar dados do Supabase:', err)
        loadMockData()
      }
    } else {
      loadMockData()
    }
  }, [currentUserId, loadMockData])

  useEffect(() => {
    loadData()

    if (isSupabaseConfigured) {
      const channel = supabase!
        .channel('schema-db-changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'issues' },
          () => {
            console.log('Realtime change received on issues')
            loadData()
          }
        )
        .subscribe()

      return () => {
        channel.unsubscribe()
      }
    }
  }, [loadData])

  const filteredOccurrences = useMemo(() => {
    let result = occurrences

    const term = search.trim().toLowerCase()
    if (term) {
      result = result.filter((item) => {
        const searchable = [
          item.title,
          item.description,
          item.address,
          item.neighborhood,
          item.category,
          item.status,
          item.severity,
          item.adminNote ?? '',
        ]
          .join(' ')
          .toLowerCase()

        return searchable.includes(term)
      })
    }

    if (isAdmin) {
      if (adminStatusFilter !== 'todos') {
        result = result.filter((item) => item.status === adminStatusFilter)
      }
      if (adminSeverityFilter !== 'todas') {
        result = result.filter((item) => item.severity === adminSeverityFilter)
      }
      if (adminNeighborhoodFilter !== 'todos') {
        result = result.filter((item) => item.neighborhood === adminNeighborhoodFilter)
      }
      if (adminCategoryFilter !== 'todas') {
        result = result.filter((item) => item.category === adminCategoryFilter)
      }

      result = [...result].sort((a, b) => {
        if (adminSortBy === 'apoios') {
          return b.supportCount - a.supportCount
        }
        if (adminSortBy === 'antigas') {
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      })
    }

    return result
  }, [
    occurrences,
    search,
    isAdmin,
    adminStatusFilter,
    adminSeverityFilter,
    adminNeighborhoodFilter,
    adminCategoryFilter,
    adminSortBy,
  ])

  const availableNeighborhoods = useMemo(() => {
    const set = new Set<string>()
    occurrences.forEach((o) => {
      if (o.neighborhood) set.add(o.neighborhood)
    })
    return Array.from(set).sort()
  }, [occurrences])

  const availableCategories = useMemo(() => {
    const set = new Set<string>()
    occurrences.forEach((o) => {
      if (o.category) set.add(o.category)
    })
    return Array.from(set).sort()
  }, [occurrences])

  const hasActiveAdminFilters = useMemo(() => {
    return (
      adminStatusFilter !== 'todos' ||
      adminSeverityFilter !== 'todas' ||
      adminNeighborhoodFilter !== 'todos' ||
      adminCategoryFilter !== 'todas' ||
      adminSortBy !== 'recentes'
    )
  }, [adminStatusFilter, adminSeverityFilter, adminNeighborhoodFilter, adminCategoryFilter, adminSortBy])

  function handleResetAdminFilters() {
    setAdminStatusFilter('todos')
    setAdminSeverityFilter('todas')
    setAdminNeighborhoodFilter('todos')
    setAdminCategoryFilter('todas')
    setAdminSortBy('recentes')
  }

  function handleExportCsv() {
    if (filteredOccurrences.length === 0) {
      alert('Nenhuma ocorrência para exportar.')
      return
    }

    const headers = [
      'ID',
      'Título',
      'Descrição',
      'Categoria',
      'Bairro',
      'Endereço',
      'Severidade',
      'Status',
      'Apoiadores',
      'Data de Criação',
      'Resposta Oficial Admin',
    ]

    const rows = filteredOccurrences.map((item) => [
      `"${item.id}"`,
      `"${item.title.replace(/"/g, '""')}"`,
      `"${(item.description || '').replace(/"/g, '""')}"`,
      `"${item.category}"`,
      `"${item.neighborhood}"`,
      `"${(item.address || '').replace(/"/g, '""')}"`,
      `"${item.severity}"`,
      `"${item.status}"`,
      item.supportCount,
      `"${new Date(item.createdAt).toLocaleString('pt-BR')}"`,
      `"${(item.adminNote || '').replace(/"/g, '""')}"`,
    ])

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const timestamp = new Date().toISOString().slice(0, 10)
    link.href = url
    link.setAttribute('download', `zelabelem_relatorio_admin_${timestamp}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const metrics = useMemo(() => {
    const active = occurrences.filter((item) => item.status !== 'resolvida').length
    const resolvedThisMonth = occurrences.filter((item) => item.status === 'resolvida').length
    const avgDays = getAverageResolutionDays(occurrences)
    const topNeighborhood = getTopNeighborhood(occurrences)
    const topCategory = getMostFrequentCategory(occurrences)

    return {
      active,
      resolvedThisMonth,
      avgDays,
      topNeighborhood,
      topCategory,
    }
  }, [occurrences])

  async function handleSupport(id: string) {
    const isSupported = votedByMe.has(id)
    const shouldVote = !isSupported

    setOccurrences((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, supportCount: item.supportCount + (shouldVote ? 1 : -1) } : item,
      ),
    )

    setVotedByMe((prev) => {
      const next = new Set(prev)
      if (shouldVote) next.add(id)
      else next.delete(id)
      return next
    })

    if (isSupabaseConfigured && currentUserId) {
      try {
        if (shouldVote) {
          const { error } = await supabase!
            .from('issue_votes')
            .insert({ issue_id: id, user_id: currentUserId })

          if (error && error.code !== '23505') throw error
        } else {
          const { error } = await supabase!
            .from('issue_votes')
            .delete()
            .eq('issue_id', id)
            .eq('user_id', currentUserId)

          if (error) throw error
        }
      } catch (err) {
        console.error('Erro ao salvar voto no Supabase:', err)
        loadData()
      }
    } else {
      const localVotes = localStorage.getItem('zelabelem_votes')
      const votesSet = localVotes ? new Set<string>(JSON.parse(localVotes)) : new Set<string>()
      if (shouldVote) votesSet.add(id)
      else votesSet.delete(id)
      localStorage.setItem('zelabelem_votes', JSON.stringify(Array.from(votesSet)))

      const localCounts = localStorage.getItem('zelabelem_vote_counts')
      const countsMap: Record<string, number> = localCounts ? JSON.parse(localCounts) : {}
      const target = occurrences.find((x) => x.id === id)
      if (target) {
        countsMap[id] = target.supportCount + (shouldVote ? 1 : -1)
        localStorage.setItem('zelabelem_vote_counts', JSON.stringify(countsMap))
      }
    }
  }

  // ─── Admin: change occurrence status ──────────────────────────────────────
  async function handleChangeStatus(id: string, newStatus: Occurrence['status']) {
    // Optimistic update
    setOccurrences((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
    )

    if (isSupabaseConfigured) {
      try {
        // Map display status to DB status
        let dbStatus = 'aberto'
        if (newStatus === 'em análise') dbStatus = 'em_analise'
        else if (newStatus === 'resolvida') dbStatus = 'resolvido'

        const { data, error } = await supabase!
          .from('issues')
          .update({ status: dbStatus })
          .eq('id', id)
          .select()

        if (error) throw error
        if (!data || data.length === 0) {
          throw new Error('Permissão negada ou ocorrência não encontrada no banco de dados.')
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        console.error('Erro ao atualizar status no Supabase:', err)
        alert(`Não foi possível atualizar o status no banco de dados: ${errorMessage}`)
        // Revert on error
        await loadData()
      }
    } else {
      // Persist status override in localStorage for mock data
      const savedStatuses = localStorage.getItem('zelabelem_status_overrides')
      const statusOverrides: Record<string, Occurrence['status']> = savedStatuses
        ? JSON.parse(savedStatuses)
        : {}
      statusOverrides[id] = newStatus
      localStorage.setItem('zelabelem_status_overrides', JSON.stringify(statusOverrides))
    }
  }

  // ─── Admin: delete occurrence ──────────────────────────────────────────────
  async function handleDelete(id: string) {
    setOccurrences((prev) => prev.filter((item) => item.id !== id))

    try {
      const savedDeleted = localStorage.getItem('zelabelem_deleted_ids')
      const deletedList: string[] = savedDeleted ? JSON.parse(savedDeleted) : []
      if (!deletedList.includes(id)) {
        deletedList.push(id)
        localStorage.setItem('zelabelem_deleted_ids', JSON.stringify(deletedList))
      }
    } catch { /* ignore */ }

    if (isSupabaseConfigured) {
      try {
        const { error } = await supabase!.from('issues').delete().eq('id', id)
        if (error) throw error
      } catch (err) {
        console.error('Erro ao excluir ocorrência:', err)
        alert('Não foi possível excluir a ocorrência no banco de dados.')
        await loadData()
      }
    } else {
      try {
        const saved = localStorage.getItem('zelabelem_local_occurrences')
        const list: Occurrence[] = saved ? JSON.parse(saved) : []
        localStorage.setItem('zelabelem_local_occurrences', JSON.stringify(list.filter((o) => o.id !== id)))
      } catch { /* ignore */ }
    }
  }

  // ─── Admin: edit occurrence title/description ─────────────────────────────
  async function handleEdit(id: string, title: string, description: string) {
    setOccurrences((prev) =>
      prev.map((item) => (item.id === id ? { ...item, title, description } : item))
    )

    try {
      const savedEdits = localStorage.getItem('zelabelem_occurrence_edits')
      const edits: Record<string, { title?: string; description?: string }> = savedEdits ? JSON.parse(savedEdits) : {}
      edits[id] = { title, description }
      localStorage.setItem('zelabelem_occurrence_edits', JSON.stringify(edits))
    } catch { /* ignore */ }

    if (isSupabaseConfigured) {
      try {
        const { error } = await supabase!
          .from('issues')
          .update({ title, description })
          .eq('id', id)
        if (error) throw error
      } catch (err) {
        console.error('Erro ao editar ocorrência:', err)
        alert('Não foi possível salvar as alterações no banco de dados.')
        await loadData()
      }
    } else {
      try {
        const saved = localStorage.getItem('zelabelem_local_occurrences')
        const list: Occurrence[] = saved ? JSON.parse(saved) : []
        localStorage.setItem(
          'zelabelem_local_occurrences',
          JSON.stringify(list.map((o) => (o.id === id ? { ...o, title, description } : o)))
        )
      } catch { /* ignore */ }
    }
  }

  // ─── Admin: save official note ────────────────────────────────────────────
  async function handleSaveNote(id: string, note: string) {
    setOccurrences((prev) =>
      prev.map((item) => (item.id === id ? { ...item, adminNote: note } : item))
    )

    try {
      const saved = localStorage.getItem('zelabelem_admin_notes')
      const notes: Record<string, string> = saved ? JSON.parse(saved) : {}
      notes[id] = note
      localStorage.setItem('zelabelem_admin_notes', JSON.stringify(notes))
    } catch { /* ignore */ }

    if (isSupabaseConfigured) {
      try {
        const { error } = await supabase!
          .from('issues')
          .update({ admin_note: note })
          .eq('id', id)
        if (error) throw error
      } catch (err) {
        console.error('Erro ao salvar nota admin:', err)
        // Non-critical: column may not exist yet — fail silently
      }
    }
  }


  async function handleCreateOccurrence(newOccurrence: Occurrence) {
    setOccurrences((prev) => [newOccurrence, ...prev])

    if (isSupabaseConfigured && currentUserId) {
      try {
        const dbStatus = 'aberto'
        let dbSeverity: 'critical' | 'high' | 'medium' | 'low' = 'medium'
        if (newOccurrence.severity === 'alta') dbSeverity = 'high'
        else if (newOccurrence.severity === 'baixa') dbSeverity = 'low'

        const payload = {
          title: newOccurrence.title,
          description: newOccurrence.description || null,
          address: newOccurrence.address || null,
          neighborhood: newOccurrence.neighborhood || null,
          category: newOccurrence.category,
          status: dbStatus,
          severity: dbSeverity,
          lat: newOccurrence.latitude,
          lng: newOccurrence.longitude,
          user_id: currentUserId,
          photo_url: newOccurrence.imageUrl || null,
        }

        const { error } = await supabase!.from('issues').insert(payload)
        if (error) throw error
        await loadData()
      } catch (err) {
        console.error('Erro ao criar ocorrência no Supabase:', err)
        alert('Ocorrência criada localmente, mas houve um erro ao enviar para o banco de dados.')
      }
    } else {
      try {
        const savedLocal = localStorage.getItem('zelabelem_local_occurrences')
        const list: Occurrence[] = savedLocal ? JSON.parse(savedLocal) : []
        localStorage.setItem('zelabelem_local_occurrences', JSON.stringify([newOccurrence, ...list]))
      } catch (err) {
        console.warn('Falha ao salvar ocorrência localmente:', err)
      }
    }
  }

  function handleStartReport(data: Partial<Occurrence> | Record<string, unknown>) {
    setPrefilledData(data)
    setIsChatOpen(false)
    setIsModalOpen(true)
  }

  return (
    <div className={`dashboard ${theme}`}>
      <TopBar
        search={search}
        onSearchChange={setSearch}
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
        userName={currentUserName}
        onLogout={handleLogout}
        isAdmin={isAdmin}
      />

      <main className="page-shell">
        {isAdmin && (
          <div className="admin-banner">
            🛡️ Você está no <strong>Modo Administrador</strong> — Gerencie os status das ocorrências abaixo.
          </div>
        )}

        <div className="metrics-grid">
          <MetricCard
            title="Ocorrências ativas"
            value={metrics.active}
            subtitle="Ainda não resolvidas"
            icon={<Activity size={18} />}
          />
          <MetricCard
            title="Resolvidas no mês"
            value={metrics.resolvedThisMonth}
            subtitle="Acompanhamento mensal"
            icon={<ShieldAlert size={18} />}
          />
          <MetricCard
            title="Tempo médio"
            value={`${metrics.avgDays} dias`}
            subtitle="Estimativa de resolução"
            icon={<Clock3 size={18} />}
          />
          <MetricCard
            title="Bairro com mais ocorrências"
            value={metrics.topNeighborhood}
            subtitle="Maior concentração"
            icon={<MapPinned size={18} />}
          />
          <MetricCard
            title="Categoria mais frequente"
            value={metrics.topCategory}
            subtitle="Problema dominante"
            icon={<AlertTriangle size={18} />}
          />
        </div>

        {isAdmin && (
          <div className="admin-toolbar-card">
            <div className="admin-toolbar-header">
              <div className="admin-toolbar-title-wrap">
                <SlidersHorizontal size={16} className="admin-toolbar-icon" />
                <span className="admin-toolbar-title">Painel de Gestão & Filtros Avançados</span>
                <span className="admin-toolbar-badge">Exclusivo Admin</span>
              </div>
              <div className="admin-toolbar-actions">
                {hasActiveAdminFilters && (
                  <button
                    type="button"
                    onClick={handleResetAdminFilters}
                    className="admin-btn-secondary"
                    title="Limpar todos os filtros"
                  >
                    <RotateCcw size={12} /> Limpar filtros
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="admin-btn-export"
                  title="Exportar ocorrências filtradas para CSV"
                >
                  <Download size={13} /> Exportar CSV ({filteredOccurrences.length})
                </button>
              </div>
            </div>

            <div className="admin-filter-grid">
              {/* Status */}
              <div className="admin-filter-field">
                <label className="admin-filter-label">Status</label>
                <select
                  value={adminStatusFilter}
                  onChange={(e) => setAdminStatusFilter(e.target.value as 'todos' | Occurrence['status'])}
                  className="admin-filter-select"
                >
                  <option value="todos">Todos os status</option>
                  <option value="aberta">Aberta</option>
                  <option value="em análise">Em análise</option>
                  <option value="resolvida">Resolvida</option>
                </select>
              </div>

              {/* Severidade */}
              <div className="admin-filter-field">
                <label className="admin-filter-label">Severidade</label>
                <select
                  value={adminSeverityFilter}
                  onChange={(e) => setAdminSeverityFilter(e.target.value as 'todas' | Occurrence['severity'])}
                  className="admin-filter-select"
                >
                  <option value="todas">Todas as severidades</option>
                  <option value="alta">Alta</option>
                  <option value="média">Média</option>
                  <option value="baixa">Baixa</option>
                </select>
              </div>

              {/* Bairro */}
              <div className="admin-filter-field">
                <label className="admin-filter-label">Bairro</label>
                <select
                  value={adminNeighborhoodFilter}
                  onChange={(e) => setAdminNeighborhoodFilter(e.target.value)}
                  className="admin-filter-select"
                >
                  <option value="todos">Todos os bairros</option>
                  {availableNeighborhoods.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>

              {/* Categoria */}
              <div className="admin-filter-field">
                <label className="admin-filter-label">Categoria</label>
                <select
                  value={adminCategoryFilter}
                  onChange={(e) => setAdminCategoryFilter(e.target.value)}
                  className="admin-filter-select"
                >
                  <option value="todas">Todas as categorias</option>
                  {availableCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Ordenação */}
              <div className="admin-filter-field">
                <label className="admin-filter-label">Ordenar por</label>
                <select
                  value={adminSortBy}
                  onChange={(e) => setAdminSortBy(e.target.value as 'recentes' | 'antigas' | 'apoios')}
                  className="admin-filter-select"
                >
                  <option value="recentes">Mais recentes</option>
                  <option value="apoios">Mais apoiadas</option>
                  <option value="antigas">Mais antigas</option>
                </select>
              </div>
            </div>

            {hasActiveAdminFilters && (
              <div className="admin-filter-active-summary">
                <span>Filtrando por: </span>
                {adminStatusFilter !== 'todos' && <span className="admin-filter-pill">Status: {adminStatusFilter}</span>}
                {adminSeverityFilter !== 'todas' && <span className="admin-filter-pill">Severidade: {adminSeverityFilter}</span>}
                {adminNeighborhoodFilter !== 'todos' && <span className="admin-filter-pill">Bairro: {adminNeighborhoodFilter}</span>}
                {adminCategoryFilter !== 'todas' && <span className="admin-filter-pill">Categoria: {adminCategoryFilter}</span>}
                {adminSortBy !== 'recentes' && <span className="admin-filter-pill">Ordem: {adminSortBy}</span>}
                <span className="admin-filter-count">({filteredOccurrences.length} de {occurrences.length} encontradas)</span>
              </div>
            )}
          </div>
        )}

        <div className="main-grid">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Ocorrências</h2>
                <p className="panel-subtitle">
                  {filteredOccurrences.length} resultado(s) exibido(s)
                </p>
              </div>
            </div>

            <OccurrenceList
              occurrences={filteredOccurrences}
              onSupport={handleSupport}
              votedByMe={votedByMe}
              isAdmin={isAdmin}
              onChangeStatus={handleChangeStatus}
              onDelete={handleDelete}
              onEdit={handleEdit}
              onSaveNote={handleSaveNote}
              theme={theme}
            />
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Mapa urbano</h2>
                <p className="panel-subtitle">Belém em tempo quase real</p>
              </div>
            </div>

            <div className="map-panel-body">
              <OccurrenceMap
                occurrences={filteredOccurrences}
                theme={theme}
                onSupport={handleSupport}
                votedByMe={votedByMe}
                isAdmin={isAdmin}
                onChangeStatus={handleChangeStatus}
                onMarkerClick={(occurrence) => setSelectedMapOccurrence(occurrence)}
              />
            </div>
          </section>
        </div>
      </main>

      {/* Admin cannot report occurrences — only citizens */}
      {!isAdmin && (
        <div className="floating-actions">
          <button
            type="button"
            className="chat-fab"
            onClick={() => setIsChatOpen((prev) => !prev)}
            aria-label="Abrir chat"
          >
            <MessageCircle size={18} />
          </button>

          <button
            type="button"
            className="floating-button"
            onClick={() => setIsModalOpen(true)}
          >
            <Plus size={18} />
            Reportar ocorrência
          </button>
        </div>
      )}

      {isChatOpen && !isAdmin ? (
        <UrbanAssistantChat
          onClose={() => setIsChatOpen(false)}
          onStartReport={handleStartReport}
          currentUserName={session?.user?.email?.split('@')[0] || 'Usuário'}
        />
      ) : null}

      {isModalOpen && !isAdmin ? (
        <ReportIssueModal
          onClose={() => {
            setIsModalOpen(false)
            setPrefilledData(null)
          }}
          onCreate={handleCreateOccurrence}
          initialData={prefilledData}
          theme={theme}
        />
      ) : null}

      {/* Detail modal opened when clicking a map pin */}
      {selectedMapOccurrence && (
        <OccurrenceDetailModal
          occurrence={selectedMapOccurrence}
          onClose={() => setSelectedMapOccurrence(null)}
          onSupport={handleSupport}
          isSupported={votedByMe.has(selectedMapOccurrence.id)}
          isAdmin={isAdmin}
          onChangeStatus={handleChangeStatus}
          onDelete={handleDelete}
          onEdit={handleEdit}
          onSaveNote={handleSaveNote}
          theme={theme}
        />
      )}
    </div>
  )
}

export default Dashboard