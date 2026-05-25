import { Link } from '@tanstack/react-router';

import { useAuthStore } from '@/features/auth/auth-store';
import { Button } from '@/shared/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/Card';

const QUICK_ACTIONS: Array<{
  to: string;
  label: string;
  description: string;
  permission: string;
}> = [
  {
    to: '/fiscal/nfe/new',
    label: 'Emitir NF-e',
    description: 'Compor e transmitir uma nova NF-e modelo 55 à SEFAZ.',
    permission: 'nfe.emit',
  },
  {
    to: '/fiscal/nfe',
    label: 'Listar NF-e',
    description: 'NF-e emitidas, com filtros por status e período.',
    permission: 'nfe.read',
  },
  {
    to: '/cadastros/customers',
    label: 'Clientes',
    description: 'Cadastro de destinatários com atributos fiscais.',
    permission: 'catalog.read',
  },
  {
    to: '/cadastros/products',
    label: 'Produtos',
    description: 'Mercadorias com tributação versionada.',
    permission: 'catalog.read',
  },
  {
    to: '/admin/certificates',
    label: 'Certificados',
    description: 'Upload de e-CNPJ A1 e gestão da custódia.',
    permission: 'vault.read',
  },
];

export function DashboardPage(): React.ReactElement {
  const { user } = useAuthStore();
  const permSet = new Set(user?.permissions ?? []);
  const hasAdmin = permSet.has('admin.full');

  const visibleActions = QUICK_ACTIONS.filter(
    (a) => hasAdmin || permSet.has(a.permission),
  );

  return (
    <div className="space-y-6 max-w-6xl">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Bem-vindo, {user?.fullName}. Use o menu lateral ou os atalhos abaixo.
        </p>
      </header>

      <div className="grid grid-cols-3 gap-4">
        {visibleActions.map((action) => (
          <Card key={action.to}>
            <CardHeader>
              <CardTitle className="text-base">{action.label}</CardTitle>
              <CardDescription>{action.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Link to={action.to}>
                <Button variant="secondary">Ir para {action.label}</Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Suas permissões</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">Papéis: </span>
            {user?.roles.length ? user.roles.join(', ') : '—'}
          </div>
          <div>
            <span className="text-muted-foreground">Permissões: </span>
            {user?.permissions.length ? user.permissions.join(', ') : '—'}
          </div>
          <div>
            <span className="text-muted-foreground">Empresas acessíveis: </span>
            {user?.accessibleCompanyIds.length ?? 0}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
