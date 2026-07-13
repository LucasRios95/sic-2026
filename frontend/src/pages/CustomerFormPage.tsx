import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { Loader2, Search } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  createCustomer,
  getCustomer,
  updateCustomer,
  type UpdateCustomerPayload,
} from '@/features/customers/customers-api';
import { lookupCep } from '@/features/lookup/lookup-api';
import { ApiError } from '@/lib/api';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { Button } from '@/shared/components/ui/Button';
import { Card, CardContent } from '@/shared/components/ui/Card';
import { Input } from '@/shared/components/ui/Input';
import { Label } from '@/shared/components/ui/Label';
import { Select } from '@/shared/components/ui/Select';
import { Textarea } from '@/shared/components/ui/Textarea';
import type { Customer, IndicadorIE, TipoPessoa } from '@/shared/types/fiscal';

const LIST_PATH = '/cadastros/customers';

type FormState = {
  tipoPessoa: TipoPessoa;
  cnpjCpf: string;
  nomeRazao: string;
  indicadorIE: IndicadorIE;
  email: string;
  consumidorFinal: boolean;
  logradouro: string;
  numero: string;
  complemento: string;
  pontoReferencia: string;
  bairro: string;
  codigoMunicipioIbge: string;
  municipio: string;
  uf: string;
  cep: string;
  observacoes: string;
};

const EMPTY_FORM: FormState = {
  tipoPessoa: 'PJ',
  cnpjCpf: '',
  nomeRazao: '',
  indicadorIE: 'CONTRIBUINTE',
  email: '',
  consumidorFinal: false,
  logradouro: '',
  numero: '',
  complemento: '',
  pontoReferencia: '',
  bairro: '',
  codigoMunicipioIbge: '',
  municipio: '',
  uf: '',
  cep: '',
  observacoes: '',
};

function customerToForm(c: Customer): FormState {
  return {
    tipoPessoa: c.tipoPessoa,
    cnpjCpf: c.cnpjCpf,
    nomeRazao: c.nomeRazao,
    indicadorIE: c.indicadorIE,
    email: c.email ?? '',
    consumidorFinal: c.consumidorFinal,
    logradouro: c.logradouro,
    numero: c.numero,
    complemento: c.complemento ?? '',
    pontoReferencia: c.pontoReferencia ?? '',
    bairro: c.bairro,
    codigoMunicipioIbge: c.codigoMunicipioIbge,
    municipio: c.municipio,
    uf: c.uf,
    cep: c.cep,
    observacoes: c.observacoes ?? '',
  };
}

const FIELD_LABELS: Record<string, string> = {
  tipoPessoa: 'Tipo de pessoa',
  cnpjCpf: 'CNPJ/CPF',
  nomeRazao: 'Razão social / Nome',
  indicadorIE: 'Indicador IE',
  email: 'E-mail',
  consumidorFinal: 'Consumidor final',
  logradouro: 'Logradouro',
  numero: 'Número',
  complemento: 'Complemento',
  pontoReferencia: 'Ponto de referência',
  bairro: 'Bairro',
  codigoMunicipioIbge: 'Cód. IBGE',
  municipio: 'Município',
  uf: 'UF',
  cep: 'CEP',
  observacoes: 'Observações',
};

function formatValidationError(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Falha ao salvar cliente.';
  const details = err.details as
    | { fieldErrors?: Record<string, string[]>; formErrors?: string[] }
    | undefined;
  if (details?.fieldErrors) {
    const lines = Object.entries(details.fieldErrors)
      .filter(([, msgs]) => msgs && msgs.length > 0)
      .map(([field, msgs]) => `${FIELD_LABELS[field] ?? field}: ${msgs.join(', ')}`);
    if (lines.length > 0) return lines.join('\n');
  }
  if (details?.formErrors && details.formErrors.length > 0) {
    return details.formErrors.join('\n');
  }
  return err.message;
}

/**
 * Campos opcionais vazios viram `null` (não `undefined`): JSON.stringify descarta chaves
 * undefined, então o backend nunca receberia o campo e um valor previamente salvo não
 * seria limpo na edição. `null` é aceito pelo schema (todos são .nullable()) e zera a coluna.
 */
function sanitizePayload<T extends Record<string, unknown>>(payload: T): T {
  const OPTIONAL_FIELDS = ['email', 'complemento', 'pontoReferencia', 'observacoes'];
  const cleaned = { ...payload };
  for (const key of OPTIONAL_FIELDS) {
    if (cleaned[key] === '') {
      (cleaned as Record<string, unknown>)[key] = null;
    }
  }
  return cleaned;
}

export function CustomerFormPage(): React.ReactElement {
  const params = useParams({ strict: false }) as { id?: string };
  const editingId = params.id ?? null;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  // Em edição, carrega o cliente e popula o form quando chegar.
  const { data: customer, isLoading } = useQuery({
    queryKey: ['customer', editingId],
    queryFn: () => getCustomer(editingId as string),
    enabled: Boolean(editingId),
  });
  useEffect(() => {
    if (customer) setForm(customerToForm(customer));
  }, [customer]);

  function backToList(): void {
    void navigate({ to: LIST_PATH });
  }

  const createMutation = useMutation({
    mutationFn: createCustomer,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      backToList();
    },
    onError: (err) => setFormError(formatValidationError(err)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateCustomerPayload }) =>
      updateCustomer(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      void queryClient.invalidateQueries({ queryKey: ['customer', editingId] });
      backToList();
    },
    onError: (err) => setFormError(formatValidationError(err)),
  });

  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);

  async function handleCepLookup(): Promise<void> {
    const digits = form.cep.replace(/\D/g, '');
    if (digits.length !== 8) return;
    setCepLoading(true);
    setCepError(null);
    try {
      const result = await lookupCep(digits);
      setForm((f) => ({
        ...f,
        cep: digits,
        logradouro: f.logradouro || result.logradouro,
        bairro: f.bairro || result.bairro,
        municipio: result.municipio,
        uf: result.uf,
        codigoMunicipioIbge: result.codigoIbgeMunicipio ?? f.codigoMunicipioIbge,
      }));
    } catch (e) {
      setCepError(
        e instanceof ApiError
          ? `CEP não encontrado (${e.message}). Preencha os campos manualmente.`
          : 'Falha ao consultar CEP.',
      );
    } finally {
      setCepLoading(false);
    }
  }

  function submitForm(e: React.FormEvent): void {
    e.preventDefault();
    if (editingId) {
      const { tipoPessoa: _t, cnpjCpf: _d, ...rest } = form;
      void _t;
      void _d;
      updateMutation.mutate({ id: editingId, payload: sanitizePayload(rest) });
    } else {
      createMutation.mutate(sanitizePayload(form));
    }
  }

  const submitting = createMutation.isPending || updateMutation.isPending;

  return (
    <PageContainer>
      <PageHeader
        title={editingId ? 'Editar cliente' : 'Novo cliente'}
        description={
          editingId
            ? 'Tipo de pessoa e CNPJ/CPF são identitários — não podem ser alterados.'
            : 'Campos mínimos para uso em emissão de NF-e.'
        }
        actions={
          <Button variant="outline" onClick={backToList} type="button">
            Voltar
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6">
          {editingId && isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (
            <form className="grid grid-cols-2 gap-4" onSubmit={submitForm}>
              <div className="space-y-1">
                <Label>Tipo de pessoa</Label>
                <Select
                  value={form.tipoPessoa}
                  disabled={!!editingId}
                  onChange={(e) => setForm({ ...form, tipoPessoa: e.target.value as TipoPessoa })}
                >
                  <option value="PJ">PJ (CNPJ)</option>
                  <option value="PF">PF (CPF)</option>
                  <option value="ESTRANGEIRO">Estrangeiro</option>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>CNPJ/CPF</Label>
                <Input
                  value={form.cnpjCpf}
                  disabled={!!editingId}
                  onChange={(e) => setForm({ ...form, cnpjCpf: e.target.value })}
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Razão social / Nome</Label>
                <Input
                  value={form.nomeRazao}
                  onChange={(e) => setForm({ ...form, nomeRazao: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Indicador IE</Label>
                <Select
                  value={form.indicadorIE}
                  onChange={(e) => setForm({ ...form, indicadorIE: e.target.value as IndicadorIE })}
                >
                  <option value="CONTRIBUINTE">Contribuinte</option>
                  <option value="ISENTO">Isento</option>
                  <option value="NAO_CONTRIBUINTE">Não contribuinte</option>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>E-mail</Label>
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>Logradouro</Label>
                <Input
                  value={form.logradouro}
                  onChange={(e) => setForm({ ...form, logradouro: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Número</Label>
                <Input
                  value={form.numero}
                  onChange={(e) => setForm({ ...form, numero: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Complemento</Label>
                <Input
                  value={form.complemento}
                  placeholder="Apto 42, Sala 2, Bloco B…"
                  maxLength={100}
                  onChange={(e) => setForm({ ...form, complemento: e.target.value })}
                />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>Ponto de referência</Label>
                <Input
                  value={form.pontoReferencia}
                  placeholder="Próximo ao mercado, em frente à praça…"
                  maxLength={150}
                  onChange={(e) => setForm({ ...form, pontoReferencia: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Bairro</Label>
                <Input
                  value={form.bairro}
                  onChange={(e) => setForm({ ...form, bairro: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Cód. IBGE</Label>
                <Input
                  value={form.codigoMunicipioIbge}
                  onChange={(e) => setForm({ ...form, codigoMunicipioIbge: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Município</Label>
                <Input
                  value={form.municipio}
                  onChange={(e) => setForm({ ...form, municipio: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>UF</Label>
                <Input
                  value={form.uf}
                  onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase().slice(0, 2) })}
                  maxLength={2}
                />
              </div>
              <div className="space-y-1">
                <Label>CEP</Label>
                <div className="flex gap-1">
                  <Input
                    value={form.cep}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 8);
                      setForm({ ...form, cep: digits });
                      setCepError(null);
                      if (digits.length === 8) void handleCepLookup();
                    }}
                    placeholder="00000000"
                    maxLength={9}
                  />
                  <button
                    type="button"
                    onClick={() => void handleCepLookup()}
                    disabled={form.cep.replace(/\D/g, '').length !== 8 || cepLoading}
                    className="px-2 rounded-md border border-input hover:bg-muted disabled:opacity-50"
                    title="Buscar endereço pelo CEP"
                  >
                    {cepLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {cepError ? <p className="text-xs text-amber-700">{cepError}</p> : null}
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Observações</Label>
                <Textarea
                  value={form.observacoes}
                  placeholder="Informações adicionais do cliente — aparecem nas Informações Complementares da NF-e."
                  maxLength={1000}
                  onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Ponto de referência e observações são anexados às Informações Complementares
                  da nota fiscal.
                </p>
              </div>
              <div className="col-span-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.consumidorFinal}
                    onChange={(e) => setForm({ ...form, consumidorFinal: e.target.checked })}
                  />
                  Consumidor final
                </label>
              </div>
              {formError ? (
                <pre className="col-span-2 text-sm text-destructive whitespace-pre-wrap font-sans">
                  {formError}
                </pre>
              ) : null}
              <div className="col-span-2 flex justify-end gap-2 border-t border-border pt-4">
                <Button variant="ghost" type="button" onClick={backToList} disabled={submitting}>
                  Cancelar
                </Button>
                <Button type="submit" loading={submitting}>
                  {editingId ? 'Salvar' : 'Criar'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
