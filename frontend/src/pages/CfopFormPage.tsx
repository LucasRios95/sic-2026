import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { listCfops, upsertCfop, type UpsertCfopPayload } from '@/features/cfops/cfops-api';
import { ApiError } from '@/lib/api';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { Button } from '@/shared/components/ui/Button';
import { Card, CardContent } from '@/shared/components/ui/Card';
import { Input } from '@/shared/components/ui/Input';
import { Label } from '@/shared/components/ui/Label';
import { Switch } from '@/shared/components/ui/Switch';

const LIST_PATH = '/admin/cfops';

interface FormState {
  codigo: string;
  descricao: string;
  grupo: string;
  geraCreditoPisCofins: boolean;
  ativo: boolean;
  observacoes: string;
}

const FORM_INITIAL: FormState = {
  codigo: '',
  descricao: '',
  grupo: '',
  geraCreditoPisCofins: false,
  ativo: true,
  observacoes: '',
};

export function CfopFormPage(): React.ReactElement {
  const params = useParams({ strict: false }) as { id?: string };
  const editingId = params.id ?? null;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<FormState>(FORM_INITIAL);

  // CFOP não tem getById: busca o catálogo e localiza por id.
  const { data: all, isLoading } = useQuery({
    queryKey: ['cfops', 'lookup-all'],
    queryFn: () => listCfops({}),
    enabled: Boolean(editingId),
  });
  useEffect(() => {
    if (!editingId || !all) return;
    const c = all.find((x) => x.id === editingId);
    if (c) {
      setForm({
        codigo: c.codigo,
        descricao: c.descricao,
        grupo: c.grupo ?? '',
        geraCreditoPisCofins: c.geraCreditoPisCofins,
        ativo: c.ativo,
        observacoes: c.observacoes ?? '',
      });
    }
  }, [editingId, all]);

  function backToList(): void {
    void navigate({ to: LIST_PATH });
  }

  const { mutate: salvar, isPending } = useMutation({
    mutationFn: upsertCfop,
    onSuccess: () => {
      toast.success(editingId ? 'CFOP atualizado!' : 'CFOP cadastrado!');
      void queryClient.invalidateQueries({ queryKey: ['cfops'] });
      backToList();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Erro ao salvar CFOP.'),
  });

  const preview = derivarTipoEscopo(form.codigo);

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!/^[123567]\d{3}$/.test(form.codigo)) {
      toast.error('Código CFOP inválido. Use 4 dígitos começando com 1/2/3/5/6/7.');
      return;
    }
    if (form.descricao.trim().length < 3) {
      toast.error('Descrição é obrigatória.');
      return;
    }
    const payload: UpsertCfopPayload = {
      codigo: form.codigo,
      descricao: form.descricao.trim(),
      grupo: form.grupo.trim() || null,
      geraCreditoPisCofins: form.geraCreditoPisCofins,
      ativo: form.ativo,
      observacoes: form.observacoes.trim() || null,
    };
    salvar(payload);
  }

  return (
    <PageContainer maxWidth="narrow">
      <PageHeader
        title={editingId ? 'Editar CFOP' : 'Novo CFOP'}
        description={
          editingId
            ? 'Atualize a descrição, grupo ou flags. O código não pode ser alterado.'
            : 'Tipo (entrada/saída) e escopo são derivados do primeiro dígito do código.'
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
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">
                    Código CFOP <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    required
                    maxLength={4}
                    placeholder="5102"
                    value={form.codigo}
                    onChange={(e) => setForm((p) => ({ ...p, codigo: e.target.value.replace(/\D/g, '') }))}
                    disabled={!!editingId}
                  />
                  {preview && (
                    <p className="text-xs text-muted-foreground">
                      → {preview.tipo} · {preview.escopo}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Grupo / categoria</Label>
                  <Input
                    placeholder="Vendas, Transferências..."
                    value={form.grupo}
                    onChange={(e) => setForm((p) => ({ ...p, grupo: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">
                  Descrição <span className="text-destructive">*</span>
                </Label>
                <Input
                  required
                  maxLength={500}
                  placeholder="Venda de mercadoria adquirida ou recebida de terceiros"
                  value={form.descricao}
                  onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Observações (opcional)</Label>
                <textarea
                  rows={2}
                  maxLength={2000}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring"
                  placeholder="Notas de uso, restrições, observações da equipe fiscal..."
                  value={form.observacoes}
                  onChange={(e) => setForm((p) => ({ ...p, observacoes: e.target.value }))}
                />
              </div>

              <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
                <ToggleRow
                  label="Gera crédito de PIS/COFINS"
                  description="Marque se esta operação dá direito a crédito no regime não-cumulativo."
                  checked={form.geraCreditoPisCofins}
                  onChange={(v) => setForm((p) => ({ ...p, geraCreditoPisCofins: v }))}
                />
                <ToggleRow
                  label="Ativo"
                  description="Desative para sinalizar código revogado ou em desuso."
                  checked={form.ativo}
                  onChange={(v) => setForm((p) => ({ ...p, ativo: v }))}
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button variant="ghost" type="button" onClick={backToList} disabled={isPending}>
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" loading={isPending}>
                  {editingId ? 'Atualizar CFOP' : 'Cadastrar CFOP'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}): React.ReactElement {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div className="space-y-0.5">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function derivarTipoEscopo(codigo: string): { tipo: string; escopo: string } | null {
  if (!/^[123567]\d{3}$/.test(codigo)) return null;
  const p = codigo[0];
  if (p === '1') return { tipo: 'Entrada', escopo: 'Estadual' };
  if (p === '2') return { tipo: 'Entrada', escopo: 'Interestadual' };
  if (p === '3') return { tipo: 'Entrada', escopo: 'Exterior' };
  if (p === '5') return { tipo: 'Saída', escopo: 'Estadual' };
  if (p === '6') return { tipo: 'Saída', escopo: 'Interestadual' };
  return { tipo: 'Saída', escopo: 'Exterior' };
}
