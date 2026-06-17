import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { createCompany, listCompanies, updateCompany } from '@/features/companies/companies-api';
import {
  COMPANY_FORM_INITIAL,
  CompanyForm,
  companyFormToPayload,
  companyToFormState,
  type CompanyFormState,
} from '@/features/companies/CompanyForm';
import { ApiError } from '@/lib/api';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { Button } from '@/shared/components/ui/Button';
import { Card, CardContent } from '@/shared/components/ui/Card';

const LIST_PATH = '/admin/companies';

export function CompanyFormPage(): React.ReactElement {
  const params = useParams({ strict: false }) as { id?: string };
  const editingId = params.id ?? null;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<CompanyFormState>(COMPANY_FORM_INITIAL);

  // Empresas não têm getById: reaproveita a query da lista (mesma chave → mesmo cache).
  const { data: companies, isLoading } = useQuery({
    queryKey: ['companies'],
    queryFn: listCompanies,
    enabled: Boolean(editingId),
  });
  useEffect(() => {
    if (!editingId || !companies) return;
    const found = companies.find((c) => c.id === editingId);
    if (found) setForm(companyToFormState(found));
  }, [editingId, companies]);

  function setField<K extends keyof CompanyFormState>(key: K, value: CompanyFormState[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function backToList(): void {
    void navigate({ to: LIST_PATH });
  }

  const createMutation = useMutation({
    mutationFn: createCompany,
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['companies'] });
      toast.success(`Empresa "${created.razaoSocial}" cadastrada!`);
      backToList();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Erro ao cadastrar empresa.'),
  });

  const updateMutation = useMutation({
    mutationFn: (id: string) => {
      // No update o CNPJ não vai (campo identitário imutável no backend).
      const { cnpj: _cnpj, ...rest } = companyFormToPayload(form);
      void _cnpj;
      return updateCompany(id, rest);
    },
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ['companies'] });
      toast.success(`"${updated.razaoSocial}" atualizada!`);
      backToList();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Erro ao atualizar empresa.'),
  });

  function submit(e: React.FormEvent): void {
    e.preventDefault();
    if (!form.cnpj || !form.razaoSocial || !form.uf || !form.municipio) {
      toast.error('CNPJ, Razão Social, UF e Município são obrigatórios.');
      return;
    }
    if (editingId) updateMutation.mutate(editingId);
    else createMutation.mutate(companyFormToPayload(form));
  }

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <PageContainer maxWidth="wide">
      <PageHeader
        title={editingId ? 'Editar empresa' : 'Nova empresa'}
        description={
          editingId
            ? 'CNPJ é imutável (afeta a chave de acesso da NF-e). Ajuste o Ambiente SEFAZ abaixo para alternar homologação/produção.'
            : 'Dados fiscais da empresa emissora. Campos com * são obrigatórios.'
        }
        actions={
          <Button variant="outline" type="button" onClick={backToList}>
            Voltar
          </Button>
        }
      />
      <Card>
        <CardContent className="pt-6">
          {editingId && isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (
            <form onSubmit={submit}>
              <CompanyForm form={form} setField={setField} disabled={saving} cnpjDisabled={!!editingId} />
              <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
                <Button variant="ghost" type="button" onClick={backToList} disabled={saving}>
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" loading={saving}>
                  {editingId ? 'Salvar alterações' : 'Salvar empresa'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
