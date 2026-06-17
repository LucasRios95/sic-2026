import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  defaultFormState,
  findParameterType,
  IS_CATEGORIAS,
  PARAMETER_TYPES,
  UF_OPTIONS,
  type ParameterFormState,
  type ParameterKind,
  type ParameterTypeDefinition,
} from '@/features/tax/parameter-types';
import { listTaxParameters, upsertTaxParameter } from '@/features/tax/tax-api';
import { ApiError } from '@/lib/api';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { Button } from '@/shared/components/ui/Button';
import { Card, CardContent } from '@/shared/components/ui/Card';
import { Input } from '@/shared/components/ui/Input';
import { Label } from '@/shared/components/ui/Label';
import { Select } from '@/shared/components/ui/Select';

const LIST_PATH = '/admin/tax-params';

export function TaxParameterFormPage(): React.ReactElement {
  const params = useParams({ strict: false }) as { id?: string };
  const editingId = params.id ?? null;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<ParameterFormState>(() => defaultFormState('IBS_ALIQUOTA_PADRAO'));
  const [scope, setScope] = useState<'global' | 'company'>('global');
  const [validFrom, setValidFrom] = useState<string>(new Date().toISOString().slice(0, 10));
  const [validTo, setValidTo] = useState<string>('');
  const [fonteNorma, setFonteNorma] = useState<string>('');

  // Parâmetro não tem getById: busca a lista e localiza por id.
  const { data: all, isLoading } = useQuery({
    queryKey: ['tax-parameters'],
    queryFn: () => listTaxParameters('all'),
    enabled: Boolean(editingId),
  });
  useEffect(() => {
    if (!editingId || !all) return;
    const editing = all.find((p) => p.id === editingId);
    if (!editing) return;
    const type = findParameterType(editing.chave);
    if (type) {
      const parsed = type.parseValor(editing.chave, editing.valor);
      setForm({ ...defaultFormState(type.kind), ...parsed });
    }
    setScope(editing.companyId ? 'company' : 'global');
    setValidFrom(editing.validFrom.slice(0, 10));
    setValidTo(editing.validTo ? editing.validTo.slice(0, 10) : '');
    setFonteNorma(editing.fonteNorma ?? '');
  }, [editingId, all]);

  function backToList(): void {
    void navigate({ to: LIST_PATH });
  }

  function changeKind(kind: ParameterKind): void {
    setForm(defaultFormState(kind));
  }

  const currentType = PARAMETER_TYPES.find((t) => t.kind === form.kind)!;

  const { mutate: salvar, isPending } = useMutation({
    mutationFn: upsertTaxParameter,
    onSuccess: () => {
      toast.success(editingId ? 'Parâmetro atualizado!' : 'Parâmetro criado!');
      void queryClient.invalidateQueries({ queryKey: ['tax-parameters'] });
      backToList();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Erro ao salvar parâmetro.'),
  });

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (currentType.fields.includes('aliquota') && !form.aliquota) {
      toast.error('Informe a alíquota.');
      return;
    }
    if (currentType.fields.includes('uf') && !form.uf) {
      toast.error('Selecione a UF.');
      return;
    }
    if (currentType.fields.includes('data') && !form.data) {
      toast.error('Informe a data.');
      return;
    }
    if (currentType.fields.includes('categoria') && !form.categoria) {
      toast.error('Informe a categoria.');
      return;
    }
    salvar({
      chave: currentType.buildChave(form),
      valor: currentType.buildValor(form),
      fonteNorma: fonteNorma || null,
      validFrom: new Date(validFrom).toISOString(),
      validTo: validTo ? new Date(validTo).toISOString() : null,
      scope,
    });
  }

  return (
    <PageContainer maxWidth="narrow">
      <PageHeader
        title={editingId ? 'Editar parâmetro' : 'Novo parâmetro tributário'}
        description={
          editingId
            ? 'Atualize alíquota ou vigência. O motor usa o novo valor a partir da data informada.'
            : 'Escolha o tipo e preencha os campos.'
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
              <div className="space-y-2">
                <Label className="text-xs">
                  Tipo do parâmetro <span className="text-destructive">*</span>
                </Label>
                <Select value={form.kind} onChange={(e) => changeKind(e.target.value as ParameterKind)} disabled={!!editingId}>
                  {PARAMETER_TYPES.map((t) => (
                    <option key={t.kind} value={t.kind}>
                      {t.label}
                    </option>
                  ))}
                </Select>
                <p className="text-xs text-muted-foreground">{currentType.description}</p>
              </div>

              <KindFields type={currentType} form={form} onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))} />

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">
                    Vigência início <span className="text-destructive">*</span>
                  </Label>
                  <Input required type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Vigência fim</Label>
                  <Input type="date" placeholder="Em vigor" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Escopo</Label>
                <Select value={scope} onChange={(e) => setScope(e.target.value as 'global' | 'company')} disabled={!!editingId}>
                  <option value="global">Global (todas as empresas)</option>
                  <option value="company">Apenas a empresa atual</option>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Fonte normativa</Label>
                <Input placeholder="RT 2025.002, NT 007/2026..." value={fonteNorma} onChange={(e) => setFonteNorma(e.target.value)} />
              </div>

              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button variant="ghost" type="button" onClick={backToList} disabled={isPending}>
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" loading={isPending}>
                  {editingId ? 'Atualizar parâmetro' : 'Salvar parâmetro'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}

function KindFields({
  type,
  form,
  onChange,
}: {
  type: ParameterTypeDefinition;
  form: ParameterFormState;
  onChange: (patch: Partial<ParameterFormState>) => void;
}): React.ReactElement {
  return (
    <div className="space-y-3">
      {type.fields.includes('uf') && (
        <div className="space-y-2">
          <Label className="text-xs">
            UF <span className="text-destructive">*</span>
          </Label>
          <Select value={form.uf ?? ''} onChange={(e) => onChange({ uf: e.target.value })}>
            {UF_OPTIONS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </Select>
        </div>
      )}

      {type.fields.includes('categoria') && (
        <div className="space-y-2">
          <Label className="text-xs">
            Categoria <span className="text-destructive">*</span>
          </Label>
          <Input
            list="is-categorias"
            value={form.categoria ?? ''}
            onChange={(e) => onChange({ categoria: e.target.value.toLowerCase() })}
            placeholder="combustivel, cigarro, bebida..."
          />
          <datalist id="is-categorias">
            {IS_CATEGORIAS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
      )}

      {type.fields.includes('aliquota') && (
        <div className="space-y-2">
          <Label className="text-xs">
            Alíquota (%) <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <Input
              required
              type="number"
              step="0.01"
              min="0"
              max="100"
              placeholder="0,00"
              value={form.aliquota ?? ''}
              onChange={(e) => onChange({ aliquota: e.target.value })}
              className="pr-8"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
              %
            </span>
          </div>
        </div>
      )}

      {type.fields.includes('modo') && (
        <div className="space-y-2">
          <Label className="text-xs">
            Modo de cobrança <span className="text-destructive">*</span>
          </Label>
          <Select value={form.modo ?? 'ANO_TESTE'} onChange={(e) => onChange({ modo: e.target.value as 'ANO_TESTE' | 'PLENO' })}>
            <option value="ANO_TESTE">Ano-teste (destaque sem recolhimento)</option>
            <option value="PLENO">Pleno (recolhimento real)</option>
          </Select>
        </div>
      )}

      {type.fields.includes('data') && (
        <div className="space-y-2">
          <Label className="text-xs">
            Data <span className="text-destructive">*</span>
          </Label>
          <Input required type="date" value={form.data ?? ''} onChange={(e) => onChange({ data: e.target.value })} />
        </div>
      )}
    </div>
  );
}
