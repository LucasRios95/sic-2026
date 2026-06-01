import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, ChevronDown } from 'lucide-react';

import { useAuthStore } from '@/features/auth/auth-store';
import { listCompanies } from '@/features/companies/companies-api';
import { cn } from '@/lib/utils';

const GLOBAL_COMPANY_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Seletor de empresa ativa exibido no cabeçalho. Troca o `selectedCompanyId` usado em
 * TODAS as chamadas company-scoped (header X-Company-Id) — incluindo o upload de
 * certificado, que valida o CNPJ do PFX contra o CNPJ da empresa ativa.
 *
 * Sem este seletor o usuário ficava preso na primeira empresa escolhida no login e,
 * ao tentar cadastrar o certificado de outra empresa, recebia CERTIFICATE_CNPJ_MISMATCH
 * porque o backend comparava o PFX da empresa B com o CNPJ da empresa A.
 *
 * Ao trocar, invalidamos o cache do react-query para que todos os dados em tela
 * (NF-e, certificados, clientes…) sejam recarregados no contexto da nova empresa.
 */
export function CompanySwitcher(): React.ReactElement | null {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const selectedCompanyId = useAuthStore((s) => s.selectedCompanyId);
  const setCompany = useAuthStore((s) => s.setCompany);

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: listCompanies,
  });

  // Restringe às empresas que o usuário pode acessar. Quem tem acesso global (GLOBAL_COMPANY_ID)
  // enxerga todas as empresas do tenant.
  const accessible = user?.accessibleCompanyIds ?? [];
  const hasGlobal = accessible.includes(GLOBAL_COMPANY_ID);
  const options = companies.filter((c) => hasGlobal || accessible.includes(c.id));

  if (options.length === 0) return null;

  const current = options.find((c) => c.id === selectedCompanyId);

  function handleChange(companyId: string): void {
    if (!companyId || companyId === selectedCompanyId) return;
    setCompany(companyId);
    // Recarrega todos os dados scoped por empresa no novo contexto. Mantemos 'companies'
    // (não muda) sendo revalidado também — barato e evita lista obsoleta.
    void queryClient.invalidateQueries();
  }

  // Com uma única empresa não há o que trocar — mostra apenas o nome como contexto.
  if (options.length === 1) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-sm">
        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="max-w-[200px] truncate font-medium text-foreground">
          {options[0].nomeFantasia || options[0].razaoSocial}
        </span>
      </div>
    );
  }

  return (
    <div className="relative">
      <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <select
        aria-label="Empresa ativa"
        value={current?.id ?? ''}
        onChange={(e) => handleChange(e.target.value)}
        className={cn(
          'h-9 max-w-[260px] cursor-pointer appearance-none truncate rounded-lg border border-border bg-background',
          'pl-9 pr-8 text-sm font-medium text-foreground transition-colors',
          'hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        {!current && (
          <option value="" disabled>
            Selecione a empresa…
          </option>
        )}
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nomeFantasia || c.razaoSocial}
          </option>
        ))}
      </select>
    </div>
  );
}
