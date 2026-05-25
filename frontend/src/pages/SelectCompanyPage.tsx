import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import { Company, listCompanies } from '@/features/companies/companies-api';
import { useAuthStore } from '@/features/auth/auth-store';
import { Button } from '@/shared/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/Card';

export function SelectCompanyPage() {
  const navigate = useNavigate();
  const setCompany = useAuthStore((s) => s.setCompany);

  const { data, isLoading, error } = useQuery({
    queryKey: ['companies'],
    queryFn: listCompanies,
  });

  function pick(company: Company) {
    setCompany(company.id);
    navigate({ to: '/dashboard' });
  }

  return (
    <main className="min-h-full bg-muted p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Selecione a empresa</h1>
          <p className="text-muted-foreground">
            Escolha em qual empresa do seu tenant você quer trabalhar nesta sessão.
          </p>
        </header>

        {isLoading && <p>Carregando empresas…</p>}
        {error && <p className="text-destructive">Falha ao carregar empresas.</p>}

        {data?.length === 0 && (
          <Card>
            <CardContent className="text-muted-foreground">
              Você ainda não tem nenhuma empresa atribuída. Peça ao administrador do tenant para
              criar uma empresa e atribuir um papel a você.
            </CardContent>
          </Card>
        )}

        <ul className="grid gap-3">
          {data?.map((company) => (
            <Card key={company.id}>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-lg">{company.razaoSocial}</CardTitle>
                  <CardDescription>
                    CNPJ {company.cnpj} · {company.municipio}/{company.uf} · {company.crt}
                  </CardDescription>
                </div>
                <Button onClick={() => pick(company)}>Acessar</Button>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <span>Ambiente: {company.ambienteSefaz}</span>
                  {company.usaIcmsSt && <span>· ICMS-ST</span>}
                  {company.usaIpi && <span>· IPI</span>}
                  {company.usaDifal && <span>· DIFAL</span>}
                  {company.usaFcp && <span>· FCP</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </ul>
      </div>
    </main>
  );
}
