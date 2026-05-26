import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Search, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  createCustomer,
  deleteCustomer,
  listCustomers,
  updateCustomer,
  type UpdateCustomerPayload,
} from '@/features/customers/customers-api';
import { lookupCep } from '@/features/lookup/lookup-api';
import { ApiError } from '@/lib/api';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/AlertDialog';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/Card';
import { Input } from '@/shared/components/ui/Input';
import { Label } from '@/shared/components/ui/Label';
import { Modal } from '@/shared/components/ui/Modal';
import { Pagination } from '@/shared/components/ui/Pagination';
import { Select } from '@/shared/components/ui/Select';
import { usePagination } from '@/shared/hooks/usePagination';
import type { Customer, IndicadorIE, TipoPessoa } from '@/shared/types/fiscal';

type FormState = {
  tipoPessoa: TipoPessoa;
  cnpjCpf: string;
  nomeRazao: string;
  indicadorIE: IndicadorIE;
  email: string;
  consumidorFinal: boolean;
  logradouro: string;
  numero: string;
  bairro: string;
  codigoMunicipioIbge: string;
  municipio: string;
  uf: string;
  cep: string;
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
  bairro: '',
  codigoMunicipioIbge: '',
  municipio: '',
  uf: '',
  cep: '',
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
    bairro: c.bairro,
    codigoMunicipioIbge: c.codigoMunicipioIbge,
    municipio: c.municipio,
    uf: c.uf,
    cep: c.cep,
  };
}

export function CustomersPage(): React.ReactElement {
  const [search, setSearch] = useState('');
  const pagination = usePagination({ initialPageSize: 50 });
  const queryClient = useQueryClient();

  useEffect(() => {
    pagination.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', search, pagination.page, pagination.pageSize],
    queryFn: () =>
      listCustomers({
        search: search || undefined,
        limit: pagination.pageSize,
        offset: pagination.offset,
      }),
    placeholderData: (prev) => prev,
  });

  // Modal de form opera em dois modos: create | edit. O id na edição alimenta a chamada PUT.
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  // Diálogo de exclusão separado pra exigir confirmação explícita (soft delete).
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);

  function openCreate(): void {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(c: Customer): void {
    setEditingId(c.id);
    setForm(customerToForm(c));
    setFormError(null);
    setFormOpen(true);
  }

  // Mapeia campos do schema do backend para rótulos legiveis em PT-BR.
  // Quando o backend retorna ValidationError com Zod flatten, expandimos a lista
  // de erros por campo aqui — assim o usuario vê exatamente o que esta faltando
  // em vez de um generico "Dados inválidos".
  const FIELD_LABELS: Record<string, string> = {
    tipoPessoa: 'Tipo de pessoa',
    cnpjCpf: 'CNPJ/CPF',
    nomeRazao: 'Razao social / Nome',
    indicadorIE: 'Indicador IE',
    email: 'E-mail',
    consumidorFinal: 'Consumidor final',
    logradouro: 'Logradouro',
    numero: 'Numero',
    bairro: 'Bairro',
    codigoMunicipioIbge: 'Cod. IBGE',
    municipio: 'Municipio',
    uf: 'UF',
    cep: 'CEP',
  };

  function formatValidationError(err: unknown): string {
    if (!(err instanceof ApiError)) return 'Falha ao salvar cliente.';
    // Backend Zod usa flatten(): { fieldErrors: { field: [msgs] }, formErrors: [] }
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

  const createMutation = useMutation({
    mutationFn: createCustomer,
    onSuccess: () => {
      setFormOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (err) => setFormError(formatValidationError(err)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateCustomerPayload }) =>
      updateCustomer(id, payload),
    onSuccess: () => {
      setFormOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (err) => setFormError(formatValidationError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCustomer,
    onSuccess: () => {
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  // Lookup automatico de CEP: quando o usuario informa CEP completo (8 digitos),
  // preenche logradouro/bairro/municipio/UF/cod.IBGE via BrasilAPI. Sem isso,
  // o usuario precisaria saber o codigo IBGE de cor (7 digitos) — pratica nenhuma.
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
        // Mantem o que o usuario ja digitou; preenche somente vazios + sempre cod.IBGE/UF
        logradouro: f.logradouro || result.logradouro,
        bairro: f.bairro || result.bairro,
        municipio: result.municipio,
        uf: result.uf,
        codigoMunicipioIbge: result.codigoIbgeMunicipio ?? f.codigoMunicipioIbge,
      }));
    } catch (e) {
      setCepError(
        e instanceof ApiError
          ? `CEP nao encontrado (${e.message}). Preencha os campos manualmente.`
          : 'Falha ao consultar CEP.',
      );
    } finally {
      setCepLoading(false);
    }
  }

  // Converte strings vazias em undefined para campos OPCIONAIS — o Zod do backend
  // declara esses campos como `.string().email().optional().nullable()`, ou seja:
  // aceita undefined/null, mas string vazia "" ainda eh validada como string
  // formatada e quebra. Submeter "" trava com "Email invalido", "IE max 20 chars",
  // etc. Sanitizamos aqui pra evitar friccao.
  function sanitizePayload<T extends Record<string, unknown>>(payload: T): T {
    const OPTIONAL_FIELDS = ['email', 'complemento'];
    const cleaned = { ...payload };
    for (const key of OPTIONAL_FIELDS) {
      if (cleaned[key] === '') {
        (cleaned as Record<string, unknown>)[key] = undefined;
      }
    }
    return cleaned;
  }

  function submitForm(): void {
    if (editingId) {
      // Tipo/documento não fazem parte do update (campos identitários).
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
    <div className="space-y-6 max-w-6xl">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground">
            Cadastro de destinatários com atributos fiscais (CRT, indicador IE, consumidor final).
          </p>
        </div>
        <Button onClick={openCreate}>Novo cliente</Button>
      </header>

      <div className="max-w-md">
        <Input
          placeholder="Buscar por nome ou CNPJ/CPF…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isLoading ? 'Carregando…' : `${data?.total ?? 0} cliente(s)`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data?.items?.length === 0 ? (
            <p className="text-muted-foreground">Nenhum cliente encontrado.</p>
          ) : null}
          {data?.items?.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{c.nomeRazao}</div>
                <div className="text-sm text-muted-foreground truncate">
                  {c.tipoPessoa} · {c.cnpjCpf} · {c.municipio}/{c.uf}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {c.consumidorFinal ? (
                  <Badge className="bg-blue-100 text-blue-800">Consumidor final</Badge>
                ) : null}
                <Badge className="bg-muted text-muted-foreground">{c.indicadorIE}</Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => openEdit(c)}
                  aria-label={`Editar ${c.nomeRazao}`}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(c)}
                  aria-label={`Excluir ${c.nomeRazao}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <Pagination
            total={data?.total ?? 0}
            page={pagination.page}
            pageSize={pagination.pageSize}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
            isLoading={isLoading}
            className="pt-2"
          />
        </CardContent>
      </Card>

      <Modal
        open={formOpen}
        title={editingId ? 'Editar cliente' : 'Novo cliente'}
        description={
          editingId
            ? 'Tipo de pessoa e CNPJ/CPF são campos identitários — não podem ser alterados.'
            : 'Campos mínimos para uso em emissão de NF-e.'
        }
        onClose={() => setFormOpen(false)}
        onConfirm={submitForm}
        confirmLabel={editingId ? 'Salvar' : 'Criar'}
        loading={submitting}
      >
        <div className="grid grid-cols-2 gap-3">
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
              onChange={(e) =>
                setForm({ ...form, indicadorIE: e.target.value as IndicadorIE })
              }
            >
              <option value="CONTRIBUINTE">Contribuinte</option>
              <option value="ISENTO">Isento</option>
              <option value="NAO_CONTRIBUINTE">Não contribuinte</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>E-mail</Label>
            <Input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
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
                  // Dispara lookup automatico ao completar 8 digitos.
                  if (digits.length === 8) {
                    void handleCepLookup();
                  }
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
            {cepError ? (
              <p className="text-xs text-amber-700">{cepError}</p>
            ) : null}
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
        </div>
      </Modal>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.nomeRazao}</strong> ({deleteTarget?.cnpjCpf}) será marcado
              como inativo. NF-e já emitidas para este cliente não serão afetadas — você só não
              poderá selecioná-lo em novas emissões. A exclusão é reversível pelo banco (soft
              delete).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Excluindo…' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
