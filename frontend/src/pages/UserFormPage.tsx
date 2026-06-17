import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useState } from 'react';

import { listCompanies } from '@/features/companies/companies-api';
import {
  assignUserRole,
  createUser,
  listRoles,
  listUserRoles,
  listUsers,
  revokeUserRole,
  updateUser,
  type AppUser,
} from '@/features/users/users-api';
import { ApiError } from '@/lib/api';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
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

const LIST_PATH = '/admin/users';
const GLOBAL = '__global__';

export function UserFormPage(): React.ReactElement {
  const params = useParams({ strict: false }) as { id?: string };
  return params.id ? <EditUser userId={params.id} /> : <CreateUser />;
}

function CreateUser(): React.ReactElement {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [novo, setNovo] = useState({ fullName: '', email: '', password: '' });
  const [erro, setErro] = useState<string | null>(null);

  function backToList(): void {
    void navigate({ to: LIST_PATH });
  }

  const criarMut = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] });
      backToList();
    },
    onError: (e) => setErro(e instanceof ApiError ? e.message : 'Falha ao criar usuário'),
  });

  return (
    <PageContainer maxWidth="narrow">
      <PageHeader
        title="Novo usuário"
        description="O usuário é criado sem acesso a nenhuma empresa. Conceda acesso depois, ao editá-lo."
        actions={
          <Button variant="outline" type="button" onClick={backToList}>
            Voltar
          </Button>
        }
      />
      <Card>
        <CardContent className="pt-6">
          <form
            className="grid gap-3"
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
            <p className="text-xs text-muted-foreground">
              Senha: mínimo 8 caracteres, com maiúscula, minúscula e número.
            </p>
            {erro ? <p className="text-sm text-destructive">{erro}</p> : null}
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="ghost" type="button" onClick={backToList} disabled={criarMut.isPending}>
                Cancelar
              </Button>
              <Button type="submit" loading={criarMut.isPending}>
                Criar usuário
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </PageContainer>
  );
}

function EditUser({ userId }: { userId: string }): React.ReactElement {
  const navigate = useNavigate();
  const usersQuery = useQuery({ queryKey: ['users'], queryFn: listUsers });
  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: listRoles });
  const companiesQuery = useQuery({ queryKey: ['companies'], queryFn: listCompanies });

  const user = usersQuery.data?.find((u) => u.id === userId);

  function backToList(): void {
    void navigate({ to: LIST_PATH });
  }

  return (
    <PageContainer>
      <PageHeader
        title="Editar usuário"
        description={user ? user.email : 'Carregando…'}
        actions={
          <Button variant="outline" type="button" onClick={backToList}>
            Voltar
          </Button>
        }
      />
      {usersQuery.isLoading ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">Carregando…</CardContent>
        </Card>
      ) : !user ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Usuário não encontrado.
          </CardContent>
        </Card>
      ) : (
        <>
          <UserDataCard user={user} />
          <AccessCard
            user={user}
            roles={rolesQuery.data ?? []}
            companies={(companiesQuery.data ?? []).map((c) => ({
              id: c.id,
              name: c.nomeFantasia || c.razaoSocial,
            }))}
          />
        </>
      )}
    </PageContainer>
  );
}

function UserDataCard({ user }: { user: AppUser }): React.ReactElement {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState(user.fullName);
  const [active, setActive] = useState(user.isActive);
  const [password, setPassword] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const salvarMut = useMutation({
    mutationFn: () => {
      const payload: { fullName?: string; active?: boolean; password?: string } = {};
      if (fullName !== user.fullName) payload.fullName = fullName;
      if (active !== user.isActive) payload.active = active;
      if (password) payload.password = password;
      return updateUser(user.id, payload);
    },
    onSuccess: () => {
      setErro(null);
      setOk(true);
      setPassword('');
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e) => {
      setOk(false);
      setErro(e instanceof ApiError ? e.message : 'Falha ao salvar');
    },
  });

  const nothingChanged = fullName === user.fullName && active === user.isActive && !password;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Dados e acesso</CardTitle>
        <CardDescription>
          Atualize o nome, ative/inative o acesso ou redefina a senha (em branco mantém a atual).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!nothingChanged) salvarMut.mutate();
          }}
        >
          <div className="space-y-1">
            <Label className="text-xs">Nome completo</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={active ? '1' : '0'} onChange={(e) => setActive(e.target.value === '1')}>
              <option value="1">Ativo</option>
              <option value="0">Inativo</option>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Nova senha (opcional)</Label>
            <Input
              type="password"
              value={password}
              placeholder="manter atual"
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">
              Mínimo 8 caracteres, com maiúscula, minúscula e número.
            </p>
          </div>
          {erro ? <p className="sm:col-span-2 text-sm text-destructive">{erro}</p> : null}
          {ok ? <p className="sm:col-span-2 text-sm text-emerald-600">Alterações salvas.</p> : null}
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" disabled={nothingChanged || salvarMut.isPending}>
              {salvarMut.isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function AccessCard({
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
      assignUserRole(user.id, { roleId, companyId: companyId === GLOBAL ? null : companyId }),
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
        <CardTitle className="text-base">Acesso por empresa</CardTitle>
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
            <p className="text-sm text-muted-foreground">Sem acesso a nenhuma empresa. Conceda abaixo.</p>
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
