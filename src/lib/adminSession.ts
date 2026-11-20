// Admin & Institutional Access control for Zela Belém

export type AdminRole = 'gestor' | 'fiscal';

export interface InstitutionalDomain {
  domain: string;
  name: string;
  defaultRole: AdminRole;
}

export const INSTITUTIONAL_DOMAINS: InstitutionalDomain[] = [
  { domain: 'belem.pa.gov.br', name: 'Prefeitura Municipal de Belém', defaultRole: 'fiscal' },
  { domain: 'semob.belem.pa.gov.br', name: 'SEMOB - Mobilidade Urbana de Belém', defaultRole: 'fiscal' },
  { domain: 'sesan.belem.pa.gov.br', name: 'SESAN - Saneamento de Belém', defaultRole: 'fiscal' },
  { domain: 'seurb.belem.pa.gov.br', name: 'SEURB - Urbanismo de Belém', defaultRole: 'fiscal' },
  { domain: 'pa.gov.br', name: 'Governo do Estado do Pará', defaultRole: 'fiscal' },
  { domain: 'prodepa.pa.gov.br', name: 'PRODEPA - Tecnologia da Informação do Pará', defaultRole: 'gestor' },
  { domain: 'ufpa.br', name: 'Universidade Federal do Pará', defaultRole: 'fiscal' },
  { domain: 'uepa.br', name: 'Universidade do Estado do Pará', defaultRole: 'fiscal' },
  { domain: 'zelabelem.com.br', name: 'Coordenação Geral Zela Belém', defaultRole: 'gestor' },
];

export const ADMIN_EMAIL = 'admin@zelabelem.com.br';
export const ADMIN_PASSWORD = 'admin';
export const ADMIN_SESSION_KEY = 'zelabelem_admin_session';

export type AdminSession = {
  isAdmin: true;
  email: string;
  name: string;
  role: AdminRole;
  roleTitle: string;
  institution: string;
};

export function checkInstitutionalAccess(email: string): {
  isInstitutional: boolean;
  institution: string;
  role: AdminRole;
  roleTitle: string;
} {
  const cleanEmail = email.trim().toLowerCase();
  const domain = cleanEmail.split('@')[1] || '';

  const matched = INSTITUTIONAL_DOMAINS.find(
    (d) => domain === d.domain || domain.endsWith('.' + d.domain)
  );

  if (!matched && cleanEmail !== ADMIN_EMAIL) {
    return {
      isInstitutional: false,
      institution: '',
      role: 'fiscal',
      roleTitle: 'Cidadão',
    };
  }

  const prefix = cleanEmail.split('@')[0] || '';
  const isSuper =
    cleanEmail === ADMIN_EMAIL ||
    prefix.startsWith('admin') ||
    prefix.startsWith('gestor') ||
    prefix.startsWith('coord') ||
    prefix.startsWith('diretor') ||
    prefix.startsWith('secretario') ||
    matched?.defaultRole === 'gestor';

  const role: AdminRole = isSuper ? 'gestor' : 'fiscal';
  const roleTitle = role === 'gestor' ? 'Gestor Geral' : 'Fiscal / Operador';
  const institution = matched ? matched.name : 'Coordenação Zela Belém';

  return {
    isInstitutional: true,
    institution,
    role,
    roleTitle,
  };
}

export function getAdminSession(): AdminSession | null {
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as AdminSession;
    if (!session || !session.isAdmin) return null;
    
    // Ensure backwards compatibility with old sessions
    if (!session.role) session.role = 'gestor';
    if (!session.roleTitle) session.roleTitle = session.role === 'gestor' ? 'Gestor Geral' : 'Fiscal / Operador';
    if (!session.institution) session.institution = 'Prefeitura de Belém';
    
    return session;
  } catch {
    return null;
  }
}

export function saveAdminSession(session: AdminSession) {
  localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
}

export function clearAdminSession() {
  localStorage.removeItem(ADMIN_SESSION_KEY);
}
