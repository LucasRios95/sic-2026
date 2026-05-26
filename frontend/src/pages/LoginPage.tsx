import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { login } from '@/features/auth/auth-api';
import { useAuthStore } from '@/features/auth/auth-store';
import { ApiError } from '@/lib/api';
import { Logo } from '@/shared/components/Logo';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Label } from '@/shared/components/ui/Label';

const GLOBAL_COMPANY_ID = '00000000-0000-0000-0000-000000000000';

const FEATURES = [
  'Ciclo de vida completo da NF-e (emissão, cancelamento, CC-e, contingência EPEC)',
  'Inbox de notas recebidas com manifestação automática',
  'Motor tributário versionado — IBS/CBS/IS para a Reforma Tributária',
];

export function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);

  const [email, setEmail] = useState('admin@sic.local');
  const [password, setPassword] = useState('');

  const mutation = useMutation({
    mutationFn: login,
    onSuccess: (data) => {
      toast.success(`Bem-vindo, ${data.user.fullName.split(' ')[0]}!`);
      setSession(data);
      const real = data.user.accessibleCompanyIds.filter((id) => id !== GLOBAL_COMPANY_ID);
      navigate({ to: real.length > 1 ? '/select-company' : '/dashboard' });
    },
    onError: (err) => {
      const msg =
        err instanceof ApiError ? err.message : 'Falha ao autenticar. Tente novamente.';
      toast.error(msg);
    },
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate({ email, password });
  }

  return (
    <main className="min-h-screen grid lg:grid-cols-2">
      {/* Brand panel */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden gradient-sidebar p-12 text-sidebar-foreground">
        <div className="absolute inset-0 opacity-30 gradient-brand mix-blend-screen" aria-hidden />
        <div
          aria-hidden
          className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-primary/30 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-accent/30 blur-3xl"
        />

        <div className="relative">
          <Logo variant="full" onDark />
        </div>

        <div className="relative space-y-6 max-w-md">
          <h2 className="font-display text-3xl font-bold leading-tight">
            Gestão fiscal preparada para a{' '}
            <span className="text-primary">Reforma Tributária</span>.
          </h2>
          <p className="text-sidebar-muted leading-relaxed">
            Emissão direto na SEFAZ, recepção de NF-e, motor tributário com IBS/CBS/IS,
            multiempresa e RBAC. Tudo num só lugar.
          </p>
          <ul className="space-y-3 text-sm">
            {FEATURES.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <span className="text-sidebar-foreground/90">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-sidebar-muted">
          © {new Date().getFullYear()} SIC NFe — Sistema Fiscal-Financeiro
        </p>
      </aside>

      {/* Form */}
      <section className="flex items-center justify-center bg-muted/40 p-6 lg:p-12">
        <div className="w-full max-w-md space-y-8 animate-fade-in">
          <div className="lg:hidden">
            <Logo variant="full" />
          </div>

          <div className="space-y-2">
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              Acesse sua conta
            </h1>
            <p className="text-muted-foreground">
              Entre com suas credenciais para acessar o sistema.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            noValidate
            className="space-y-5 rounded-xl border bg-card p-8 shadow-card"
          >
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                placeholder="voce@empresa.com"
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
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="animate-spin" />
                  Entrando…
                </>
              ) : (
                'Entrar'
              )}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              Esqueceu a senha? Fale com o administrador do tenant.
            </p>
          </form>
        </div>
      </section>
    </main>
  );
}
