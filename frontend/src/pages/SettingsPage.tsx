import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { changePassword } from '@/features/auth/auth-api';
import { useAuthStore } from '@/features/auth/auth-store';
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

/** Espelha a regra de força do backend (changePasswordSchema). */
function validatePasswordStrength(pwd: string): string | null {
  if (pwd.length < 8) return 'A senha deve ter pelo menos 8 caracteres.';
  if (!/[A-Z]/.test(pwd)) return 'A senha deve conter ao menos uma letra maiúscula.';
  if (!/[a-z]/.test(pwd)) return 'A senha deve conter ao menos uma letra minúscula.';
  if (!/\d/.test(pwd)) return 'A senha deve conter ao menos um número.';
  return null;
}

export function SettingsPage(): React.ReactElement {
  return (
    <PageContainer maxWidth="narrow">
      <PageHeader title="Configurações" description="Seu perfil e segurança da conta." />
      <ProfileCard />
      <ChangePasswordCard />
    </PageContainer>
  );
}

function ProfileCard(): React.ReactElement {
  const user = useAuthStore((s) => s.user);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Meu perfil</CardTitle>
        <CardDescription>
          Dados da sua conta. Para alterar nome ou papéis, peça a um administrador na tela de
          Usuários.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome" value={user?.fullName ?? '—'} />
        <Field label="E-mail" value={user?.email ?? '—'} />
        <Field label="Papel" value={user?.roles?.[0] ?? 'Sem papel'} />
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

function ChangePasswordCard(): React.ReactElement {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const mut = useMutation({
    mutationFn: () => changePassword({ currentPassword: current, newPassword: next }),
    onSuccess: () => {
      setOk(true);
      setErro(null);
      setCurrent('');
      setNext('');
      setConfirm('');
    },
    onError: (e) => {
      setOk(false);
      setErro(e instanceof ApiError ? e.message : 'Falha ao trocar a senha.');
    },
  });

  function submit(e: React.FormEvent): void {
    e.preventDefault();
    setOk(false);
    if (next !== confirm) {
      setErro('A confirmação não confere com a nova senha.');
      return;
    }
    const weak = validatePasswordStrength(next);
    if (weak) {
      setErro(weak);
      return;
    }
    setErro(null);
    mut.mutate();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Trocar senha</CardTitle>
        <CardDescription>
          Informe a senha atual e a nova. Mínimo 8 caracteres, com maiúscula, minúscula e número.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid max-w-sm gap-3" onSubmit={submit}>
          <div className="space-y-1">
            <Label className="text-xs">Senha atual</Label>
            <Input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nova senha</Label>
            <Input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Confirmar nova senha</Label>
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <div>
            <Button type="submit" disabled={mut.isPending}>
              {mut.isPending ? 'Salvando…' : 'Trocar senha'}
            </Button>
          </div>
          {erro ? <p className="text-sm text-destructive">{erro}</p> : null}
          {ok ? <p className="text-sm text-emerald-600">Senha alterada com sucesso.</p> : null}
        </form>
      </CardContent>
    </Card>
  );
}
