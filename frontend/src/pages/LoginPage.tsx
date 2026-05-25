import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { login } from '@/features/auth/auth-api';
import { useAuthStore } from '@/features/auth/auth-store';
import { ApiError } from '@/lib/api';
import { Button } from '@/shared/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/Card';
import { Input } from '@/shared/components/ui/Input';
import { Label } from '@/shared/components/ui/Label';

const GLOBAL_COMPANY_ID = '00000000-0000-0000-0000-000000000000';

export function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);

  const [email, setEmail] = useState('admin@sic.local');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: login,
    onSuccess: (data) => {
      setSession(data);
      const real = data.user.accessibleCompanyIds.filter((id) => id !== GLOBAL_COMPANY_ID);
      if (real.length > 1) {
        navigate({ to: '/select-company' });
      } else {
        navigate({ to: '/dashboard' });
      }
    },
    onError: (err) => {
      if (err instanceof ApiError) setError(err.message);
      else setError('Falha ao autenticar. Tente novamente.');
    },
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    mutation.mutate({ email, password });
  }

  return (
    <main className="min-h-full grid place-items-center bg-muted p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sistema Fiscal-Financeiro</CardTitle>
          <CardDescription>Entre com suas credenciais para acessar o sistema.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit} noValidate>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </CardContent>
          <CardFooter className="flex justify-end">
            <Button type="submit" loading={mutation.isPending} className="w-full">
              Entrar
            </Button>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
