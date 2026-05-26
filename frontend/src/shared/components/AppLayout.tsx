import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import {
  ArrowDownLeft,
  Building2,
  Calculator,
  ChevronLeft,
  ChevronRight,
  FileText,
  Hash,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Plus,
  Settings,
  Shield,
  Users,
  X,
} from 'lucide-react';
import { useState } from 'react';

import { logout } from '@/features/auth/auth-api';
import { useAuthStore } from '@/features/auth/auth-store';
import { Logo } from '@/shared/components/Logo';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  requiredPermission?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Visão geral',
    items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Fiscal',
    items: [
      { to: '/fiscal/nfe', label: 'NF-e emitidas', icon: FileText, requiredPermission: 'nfe.read' },
      { to: '/fiscal/nfe/new', label: 'Emitir NF-e', icon: Plus, requiredPermission: 'nfe.emit' },
      { to: '/fiscal/nfe/inutilizar', label: 'Inutilizar faixa', icon: Hash, requiredPermission: 'nfe.cancel' },
      { to: '/fiscal/recebidos', label: 'Notas recebidas', icon: ArrowDownLeft, requiredPermission: 'nfe.read' },
    ],
  },
  {
    label: 'Cadastros',
    items: [
      { to: '/cadastros/customers', label: 'Clientes', icon: Users, requiredPermission: 'catalog.read' },
      { to: '/cadastros/products', label: 'Produtos', icon: Package, requiredPermission: 'catalog.read' },
    ],
  },
  {
    label: 'Tributação',
    items: [
      { to: '/admin/tax-params', label: 'Parâmetros (IBS/CBS)', icon: Calculator, requiredPermission: 'tax.parameter.read' },
      { to: '/admin/tax-interstate', label: 'Alíquotas interestaduais', icon: Calculator, requiredPermission: 'tax.parameter.read' },
      { to: '/admin/tax-icms-st', label: 'MVA ICMS-ST', icon: Calculator, requiredPermission: 'tax.parameter.write' },
      { to: '/admin/tax-benefits', label: 'Benefícios fiscais', icon: Calculator, requiredPermission: 'tax.parameter.write' },
      { to: '/admin/cfops', label: 'CFOPs', icon: Hash, requiredPermission: 'catalog.read' },
      { to: '/admin/ncms', label: 'NCMs', icon: Hash, requiredPermission: 'catalog.read' },
    ],
  },
  {
    label: 'Administração',
    items: [
      { to: '/admin/companies', label: 'Empresas', icon: Building2, requiredPermission: 'company.read' },
      { to: '/admin/certificates', label: 'Certificados A1', icon: Shield, requiredPermission: 'vault.read' },
      { to: '/admin/configuracoes', label: 'Configurações', icon: Settings, requiredPermission: 'admin.full' },
    ],
  },
];

const ROLE_LABEL: Record<string, string> = {
  Administrador: 'Administrador',
  Gestor: 'Gestor',
  Faturista: 'Faturista',
  Fiscal: 'Fiscal',
  Compras: 'Compras',
  Financeiro: 'Financeiro',
};

export function AppLayout(): React.ReactElement {
  const navigate = useNavigate();
  const { user, refreshToken, clear } = useAuthStore();
  const location = useRouterState({ select: (s) => s.location.pathname });
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const permsSet = new Set(user?.permissions ?? []);
  const hasAdmin = permsSet.has('admin.full');

  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => !item.requiredPermission || hasAdmin || permsSet.has(item.requiredPermission),
    ),
  })).filter((group) => group.items.length > 0);

  async function handleLogout(): Promise<void> {
    if (refreshToken) {
      try {
        await logout(refreshToken);
      } catch {
        // ignora — logout local segue
      }
    }
    clear();
    navigate({ to: '/login' });
  }

  function isActive(to: string): boolean {
    return location === to || location.startsWith(`${to}/`);
  }

  const sidebar = (
    <aside
      className={cn(
        'gradient-sidebar flex h-full flex-col border-r border-sidebar-border transition-all duration-300',
        collapsed ? 'w-[72px]' : 'w-[260px]',
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-4 shrink-0">
        {collapsed ? <Logo variant="mark" /> : <Logo variant="compact" onDark />}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto scrollbar-hidden px-3 py-4 space-y-5">
        {visibleGroups.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <h3 className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted">
                {group.label}
              </h3>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item.to);
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      onClick={() => setMobileOpen(false)}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                        active
                          ? 'bg-sidebar-accent text-sidebar-primary'
                          : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                      )}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* User & Collapse */}
      <div className="border-t border-sidebar-border p-3 space-y-2 shrink-0">
        {!collapsed && user && (
          <div className="px-3 py-2">
            <p className="text-xs font-semibold text-sidebar-accent-foreground truncate">
              {user.fullName}
            </p>
            <p className="text-xs text-sidebar-muted truncate">
              {ROLE_LABEL[user.roles[0] ?? ''] ?? user.roles[0] ?? 'Sem papel'}
            </p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-muted hover:bg-sidebar-accent hover:text-destructive transition-colors"
          title={collapsed ? 'Sair' : undefined}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Sair</span>}
        </button>
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="hidden md:flex w-full items-center justify-center rounded-lg py-1.5 text-sidebar-muted hover:text-sidebar-foreground transition-colors"
          title={collapsed ? 'Expandir' : 'Colapsar'}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar desktop */}
      <div className="hidden md:block sticky top-0 h-screen">{sidebar}</div>

      {/* Drawer mobile */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div
            className="flex-1 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full" onClick={(e) => e.stopPropagation()}>
            {sidebar}
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-background border-b border-border px-4 lg:px-6 py-3 flex items-center justify-between sticky top-0 z-30">
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="md:hidden p-2 rounded-md text-foreground hover:bg-muted"
            aria-label="Menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <div className="flex-1" />

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-xs text-muted-foreground">
              {ROLE_LABEL[user?.roles[0] ?? ''] ?? user?.roles[0] ?? '—'}
            </span>
            <UserAvatar name={user?.fullName ?? '?'} />
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function UserAvatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full gradient-primary text-primary-foreground text-xs font-semibold shadow-sm">
      {initials || '?'}
    </div>
  );
}
