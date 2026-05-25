import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';

import { logout } from '@/features/auth/auth-api';
import { useAuthStore } from '@/features/auth/auth-store';
import { Button } from '@/shared/components/ui/Button';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  requiredPermission?: string;
}

const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/fiscal/nfe', label: 'NF-e', requiredPermission: 'nfe.read' },
  { to: '/fiscal/nfe/new', label: 'Nova NF-e', requiredPermission: 'nfe.emit' },
  { to: '/cadastros/customers', label: 'Clientes', requiredPermission: 'catalog.read' },
  { to: '/cadastros/products', label: 'Produtos', requiredPermission: 'catalog.read' },
  { to: '/admin/certificates', label: 'Certificados', requiredPermission: 'vault.read' },
];

/**
 * Layout autenticado padrão. Sidebar com itens filtrados por permissão; header com
 * usuário + empresa selecionada + ação de logout. Outlet renderiza a página atual.
 *
 * O TanStack Router decide se aplicar este layout via rota wrapper — ver routes.tsx.
 */
export function AppLayout(): React.ReactElement {
  const navigate = useNavigate();
  const { user, refreshToken, clear } = useAuthStore();
  const location = useRouterState({ select: (s) => s.location.pathname });

  const permsSet = new Set(user?.permissions ?? []);
  const allowedItems = NAV.filter((item) => {
    if (!item.requiredPermission) return true;
    if (permsSet.has('admin.full')) return true;
    return permsSet.has(item.requiredPermission);
  });

  async function handleLogout(): Promise<void> {
    if (refreshToken) {
      try {
        await logout(refreshToken);
      } catch {
        // logout local segue mesmo se o backend já invalidou
      }
    }
    clear();
    navigate({ to: '/login' });
  }

  return (
    <div className="min-h-full flex bg-muted">
      <aside className="w-56 border-r border-border bg-background flex flex-col">
        <div className="p-4 border-b border-border">
          <h1 className="text-sm font-bold tracking-tight">SIC 2026</h1>
          <p className="text-xs text-muted-foreground">Sistema Fiscal-Financeiro</p>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {allowedItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'block rounded-md px-3 py-2 text-sm transition-colors',
                location === item.to || location.startsWith(`${item.to}/`)
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground hover:bg-muted',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col">
        <header className="bg-background border-b border-border px-6 py-3 flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{user?.fullName}</span> · {user?.email}
          </div>
          <Button variant="ghost" onClick={handleLogout}>
            Sair
          </Button>
        </header>
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
