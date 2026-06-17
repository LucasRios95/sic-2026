import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import { listUsers } from '@/features/users/users-api';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { Button } from '@/shared/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/Card';

export function UsersPage(): React.ReactElement {
  const navigate = useNavigate();
  const usersQuery = useQuery({ queryKey: ['users'], queryFn: listUsers });

  return (
    <PageContainer>
      <PageHeader
        title="Usuários"
        description="Cadastre usuários e gerencie a quais empresas cada um tem acesso (via papel por empresa)."
        actions={
          <Button onClick={() => void navigate({ to: '/admin/users/new' })}>Novo usuário</Button>
        }
      />

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
                className="grid grid-cols-[1fr_1fr_90px_120px] gap-2 items-center border-b border-border py-2 last:border-0"
              >
                <span className="font-medium">{u.fullName}</span>
                <span className="text-sm text-muted-foreground">{u.email}</span>
                <span className={`text-xs ${u.isActive ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                  {u.isActive ? 'Ativo' : 'Inativo'}
                </span>
                <Button
                  variant="outline"
                  onClick={() => void navigate({ to: '/admin/users/$id/edit', params: { id: u.id } })}
                >
                  Editar
                </Button>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum usuário cadastrado.</p>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
