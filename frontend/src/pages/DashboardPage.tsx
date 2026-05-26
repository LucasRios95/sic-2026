import { useNavigate } from '@tanstack/react-router';
import {
  ArrowUpRight,
  Building2,
  FileText,
  Package,
  Plus,
  Shield,
  Users,
} from 'lucide-react';
import { ComponentType } from 'react';

import { useAuthStore } from '@/features/auth/auth-store';
import { Card } from '@/shared/components/ui/Card';

interface QuickAction {
  to: string;
  label: string;
  description: string;
  permission: string;
  color: 'primary' | 'accent' | 'info';
  icon: ComponentType<{ className?: string }>;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    to: '/fiscal/nfe/new',
    label: 'Emitir NF-e',
    description: 'Compor e transmitir uma nova NF-e modelo 55 à SEFAZ.',
    permission: 'nfe.emit',
    color: 'primary',
    icon: Plus,
  },
  {
    to: '/fiscal/nfe',
    label: 'NF-e emitidas',
    description: 'Histórico com filtros por status, cliente e período.',
    permission: 'nfe.read',
    color: 'info',
    icon: FileText,
  },
  {
    to: '/admin/companies',
    label: 'Empresas',
    description: 'Cadastrar e gerenciar empresas emissoras (CNPJs).',
    permission: 'company.read',
    color: 'accent',
    icon: Building2,
  },
  {
    to: '/cadastros/customers',
    label: 'Clientes',
    description: 'Destinatários PF/PJ com atributos fiscais.',
    permission: 'catalog.read',
    color: 'info',
    icon: Users,
  },
  {
    to: '/cadastros/products',
    label: 'Produtos',
    description: 'Mercadorias com regras tributárias versionadas.',
    permission: 'catalog.read',
    color: 'accent',
    icon: Package,
  },
  {
    to: '/admin/certificates',
    label: 'Certificados A1',
    description: 'Upload de e-CNPJ e custódia segura com alerta de expiração.',
    permission: 'vault.read',
    color: 'primary',
    icon: Shield,
  },
];

const COLOR_MAP: Record<QuickAction['color'], { bg: string; text: string }> = {
  primary: { bg: 'bg-primary/10', text: 'text-primary' },
  accent: { bg: 'bg-accent/10', text: 'text-accent' },
  info: { bg: 'bg-info/10', text: 'text-info' },
};

export function DashboardPage(): React.ReactElement {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const permSet = new Set(user?.permissions ?? []);
  const hasAdmin = permSet.has('admin.full');

  const visibleActions = QUICK_ACTIONS.filter(
    (a) => hasAdmin || permSet.has(a.permission),
  );

  const stats = [
    {
      label: 'Papéis ativos',
      value: user?.roles.length ?? 0,
      description: user?.roles.join(', ') || '—',
      color: 'primary' as const,
      icon: Shield,
    },
    {
      label: 'Permissões',
      value: user?.permissions.length ?? 0,
      description: hasAdmin
        ? 'Acesso total (admin)'
        : `${user?.permissions.length ?? 0} permissões granulares`,
      color: 'info' as const,
      icon: FileText,
    },
    {
      label: 'Empresas acessíveis',
      value: user?.accessibleCompanyIds.length ?? 0,
      description: 'CNPJs vinculados ao seu usuário',
      color: 'accent' as const,
      icon: Building2,
    },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="animate-fade-in">
        <h1 className="font-display text-3xl font-bold text-foreground">
          Olá, {user?.fullName?.split(' ')[0] ?? 'usuário'}
        </h1>
        <p className="text-muted-foreground mt-1">
          Visão geral do sistema fiscal. Use os atalhos abaixo ou navegue pelo menu lateral.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((stat, i) => {
          const colors = COLOR_MAP[stat.color];
          const Icon = stat.icon;
          return (
            <Card
              key={stat.label}
              className="p-5 shadow-card hover:shadow-card-hover transition-shadow border-0 animate-fade-in"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1.5">
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="font-display text-3xl font-bold text-foreground">{stat.value}</p>
                  <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                    {stat.description}
                  </p>
                </div>
                <div className={`rounded-xl p-2.5 ${colors.bg}`}>
                  <Icon className={`h-5 w-5 ${colors.text}`} />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Quick actions */}
      <div className="space-y-4 animate-fade-in" style={{ animationDelay: '300ms' }}>
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-lg font-semibold text-foreground">Atalhos rápidos</h2>
          <span className="text-xs text-muted-foreground">
            {visibleActions.length} ação{visibleActions.length !== 1 ? 'ões' : ''} disponíveis
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleActions.map((action, i) => {
            const colors = COLOR_MAP[action.color];
            const Icon = action.icon;
            return (
              <Card
                key={action.to}
                onClick={() => navigate({ to: action.to })}
                className="p-5 border-0 shadow-card hover:shadow-card-hover transition-all cursor-pointer group animate-fade-in"
                style={{ animationDelay: `${(i + 3) * 60}ms` }}
              >
                <div className="flex items-start gap-4">
                  <div className={`rounded-xl p-3 ${colors.bg}`}>
                    <Icon className={`h-6 w-6 ${colors.text}`} />
                  </div>
                  <div className="flex-1 space-y-1 min-w-0">
                    <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                      {action.label}
                    </h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {action.description}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-1 text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  Acessar
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
