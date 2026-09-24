import { useState, useRef, useEffect } from 'react'
import { Bell, Search, UserCircle2, Sun, Moon, LogOut, Settings, User, ShieldCheck } from 'lucide-react'

interface TopBarProps {
  search: string
  onSearchChange: (value: string) => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  userName?: string
  onLogout?: () => void
  isAdmin?: boolean
}

function TopBar({
  search,
  onSearchChange,
  theme,
  onToggleTheme,
  userName = 'Convidado',
  onLogout,
  isAdmin = false,
}: TopBarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  return (
    <header className="topbar">
      <div className="topbar-left">
        <img src="/logo.png" alt="Zela Logo" className="brand-logo" />

        <div>
          <h1 className="brand-title">Zela</h1>
          <p className="brand-subtitle">Sistema colaborativo de problemas urbanos</p>
        </div>
      </div>

      <div className="topbar-right">
        <div className="searchbar">
          <Search size={16} />
          <input
            type="text"
            placeholder="Buscar ocorrências, bairros ou categorias..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        <button
          className="icon-button"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <button className="icon-button" aria-label="Notificações">
          <Bell size={18} />
        </button>

        <div className="profile-menu-container" ref={dropdownRef}>
          <button
            className={`profile-button${isAdmin ? ' profile-button--admin' : ''}`}
            onClick={() => setDropdownOpen((prev) => !prev)}
            aria-label="Menu do usuário"
            aria-expanded={dropdownOpen}
          >
            {isAdmin ? <ShieldCheck size={18} /> : <UserCircle2 size={18} />}
            <span>{userName}</span>
            {isAdmin && <span className="admin-badge-pill">Admin</span>}
          </button>

          {dropdownOpen ? (
            <div className="profile-dropdown">
              <div className="profile-dropdown-header">
                {isAdmin ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#f59e0b' }}>
                    <ShieldCheck size={14} /> Administrador
                  </span>
                ) : (
                  'Opções do Usuário'
                )}
              </div>

              {!isAdmin && (
                <>
                  <button
                    type="button"
                    className="profile-dropdown-item"
                    onClick={() => {
                      setDropdownOpen(false)
                      alert('Visualização do perfil em desenvolvimento.')
                    }}
                  >
                    <User size={16} />
                    <span>Meu Perfil</span>
                  </button>

                  <button
                    type="button"
                    className="profile-dropdown-item"
                    onClick={() => {
                      setDropdownOpen(false)
                      alert('Configurações da conta em desenvolvimento.')
                    }}
                  >
                    <Settings size={16} />
                    <span>Configurações</span>
                  </button>
                </>
              )}

              <button
                type="button"
                className="profile-dropdown-item profile-dropdown-item--logout"
                onClick={() => {
                  setDropdownOpen(false)
                  if (onLogout) onLogout()
                }}
              >
                <LogOut size={16} />
                <span>Sair</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}

export default TopBar