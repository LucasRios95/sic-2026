import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { listCompanies } from '@/features/companies/companies-api';
import {
  assignUserRole,
  createUser,
  listRoles,
  listUserRoles,
  listUsers,
  revokeUserRole,
  type AppUser,
} from '@/features/users/users-api';
import { ApiError } from '@/lib/api';
import { Button } from '@/shared/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/Card';
import { Input } from '@/shared/components/ui/Input';
import { Label } from '@/shared/components/ui/Label';
import { Select } from '@/shared/components/ui/Select';

const GLOBAL = '__global__';

export function UsersPage(): React.ReactElement {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<AppUser | null>(null);

  const usersQuery = useQuery({ queryKey: ['users'], queryFn: listUsers });
  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: listRoles });
  const companiesQuery = useQuery({ queryKey: ['companies'], queryFn: listCompanies });

  // --- Criação de usuário ---
  const [novo, setNovo] = useState({ fullName: '', email: '', password: '' });
  const [erroCriar, setErroCriar] = useState<string | null>(null);
  const criarMut = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      setNovo({ fullName: '', email: '', password: '' });
      setErroCriar(null);
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e) => setErroCriar(e instanceof ApiError ? e.message : 'Falha ao criar usuário'),
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Usuários</h1>
        <p className="text-muted-foreground">
          Cadastre usuários e gerencie a quais empresas cada um tem acesso (via papel por empresa).
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Novo usuário</CardTitle>
          <CardDescription>
            O usuário é criado sem acesso a nenhuma empresa. Conceda acesso abaixo, na lista.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end"
            onSubmit={(e) => {
              e.preventDefault();
              criarMut.mutate(novo);
            }}
          >
            <div className="space-y-1">
              <Label className="text-xs">Nome completo</Label>
              <Input
                value={novo.fullName}
                onChange={(e) => setNovo((s) => ({ ...s, fullName: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">E-mail</Label>
              <Input
                type="email"
                value={novo.email}
                onChange={(e) => setNovo((s) => ({ ...s, email: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Senha</Label>
              <Input
                type="password"
                value={novo.password}
                onChange={(e) => setNovo((s) => ({ ...s, password: e.target.value }))}
                required
              />
            </div>
            <Button type="submit" disabled={criarMut.isPending}>
              {criarMut.isPending ? 'Criando…' : 'Criar'}
            </Button>
          </form>
          {erroCriar ? <p className="mt-2 text-sm text-destructive">{erroCriar}</p> : null}
          <p className="mt-2 text-xs text-muted-foreground">
            Senha: mínimo 8 caracteres, com maiúscula, minúscula e número.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usuários do tenant</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {usersQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : usersQuery.data && usersQuery.data.length > 0 ? (
            usersQuery.data.map((u) => (
              <div
                key={u.id}
                className="grid grid-cols-[1fr_1fr_90px_140px] gap-2 items-center border-b border-border py-2 last:border-0"
              >
                <span className="font-medium">{u.fullName}</span>
                <span className="text-sm text-muted-foreground">{u.email}</span>
                <span className={`text-xs ${u.isActive ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                  {u.isActive ? 'Ativo' : 'Inativo'}
                </span>
                <Button
                  variant={selected?.id === u.id ? 'default' : 'outline'}
                  onClick={() => setSelected(selected?.id === u.id ? null : u)}
                >
                  {selected?.id === u.id ? 'Fechar' : 'Gerenciar acesso'}
                </Button>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum usuário cadastrado.</p>
          )}
        </CardContent>
      </Card>

      {selected ? (
        <AccessPanel
          key={selected.id}
          user={selected}
          roles={rolesQuery.data ?? []}
          companies={(companiesQuery.data ?? []).map((c) => ({
            id: c.id,
            name: c.nomeFantasia || c.razaoSocial,
          }))}
        />
      ) : null}
    </div>
  );
}

function AccessPanel({
  user,
  roles,
  companies,
}: {
  user: AppUser;
  roles: { id: string; name: string; description: string | null }[];
  companies: { id: string; name: string }[];
}): React.ReactElement {
  const qc = useQueryClient();
  const key = ['user-roles', user.id];
  const assignmentsQuery = useQuery({ queryKey: key, queryFn: () => listUserRoles(user.id) });

  const [roleId, setRoleId] = useState('');
  const [companyId, setCompanyId] = useState(GLOBAL);
  const [erro, setErro] = useState<string | null>(null);

  const refetch = () => qc.invalidateQueries({ queryKey: key });

  const grantMut = useMutation({
    mutationFn: () =>
      assignUserRole(user.id, {
        roleId,
        companyId: companyId === GLOBAL ? null : companyId,
      }),
    onSuccess: () => {
      setErro(null);
      setRoleId('');
      void refetch();
    },
    onError: (e) => setErro(e instanceof ApiError ? e.message : 'Falha ao conceder acesso'),
  });

  const revokeMut = useMutation({
    mutationFn: (v: { roleId: string; companyId: string | null }) => revokeUserRole(user.id, v),
    onSuccess: () => void refetch(),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Acesso de {user.fullName}</CardTitle>
        <CardDescription>
          Cada papel concedido numa empresa dá acesso àquela empresa. &quot;Todas as empresas&quot;
          aplica o papel a todo o tenant.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          {assignmentsQuery.data && assignmentsQuery.data.length > 0 ? (
            assignmentsQuery.data.map((a) => (
              <div
                key={`${a.roleId}-${a.companyId ?? 'global'}`}
                className="grid grid-cols-[1fr_1fr_90px] gap-2 items-center border-b border-border py-2 last:border-0"
              >
                <span className="text-sm font-medium">{a.roleName}</span>
                <span className="text-sm text-muted-foreground">
                  {a.companyId ? a.companyName : 'Todas as empresas'}
                </span>
                <Button
                  variant="ghost"
                  onClick={() => revokeMut.mutate({ roleId: a.roleId, companyId: a.companyId })}
                  disabled={revokeMut.isPending}
                >
                  Remover
                </Button>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              Sem acesso a nenhuma empresa. Conceda abaixo.
            </p>
          )}
        </div>

        <form
          className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end border-t border-border pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (roleId) grantMut.mutate();
          }}
        >
          <div className="space-y-1">
            <Label className="text-xs">Empresa</Label>
            <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value={GLOBAL}>Todas as empresas (global)</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Papel</Label>
            <Select value={roleId} onChange={(e) => setRoleId(e.target.value)} required>
              <option value="">Selecione…</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" disabled={!roleId || grantMut.isPending}>
            Conceder
          </Button>
        </form>
        {erro ? <p className="text-sm text-destructive">{erro}</p> : null}
      </CardContent>
    </Card>
  );
}
