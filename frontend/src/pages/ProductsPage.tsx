import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { createProduct, listProducts } from '@/features/products/products-api';
import { ApiError } from '@/lib/api';
import { Button } from '@/shared/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/Card';
import { Input } from '@/shared/components/ui/Input';
import { Label } from '@/shared/components/ui/Label';
import { Modal } from '@/shared/components/ui/Modal';

export function ProductsPage(): React.ReactElement {
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['products', search],
    queryFn: () => listProducts({ search: search || undefined, limit: 100 }),
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    codigo: '',
    descricao: '',
    ncm: '',
    cest: '',
    origem: 0,
    unidadeComercial: 'UN',
    unidadeTributavel: 'UN',
    aliqIcms: '18.0000',
    cstIcms: '00',
    cstIbsCbs: 'TRIBUTACAO_INTEGRAL',
    cClassTrib: '100000',
  });
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      createProduct({
        codigo: form.codigo,
        descricao: form.descricao,
        ncm: form.ncm,
        cest: form.cest || undefined,
        origem: form.origem,
        unidadeComercial: form.unidadeComercial,
        unidadeTributavel: form.unidadeTributavel,
        initialTaxRule: {
          aliqIcms: form.aliqIcms,
          cstIcms: form.cstIcms,
          cstIbsCbs: form.cstIbsCbs,
          cClassTrib: form.cClassTrib,
          validFrom: new Date().toISOString(),
        },
      }),
    onSuccess: () => {
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Falha ao criar produto'),
  });

  return (
    <div className="space-y-6 max-w-6xl">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Produtos</h1>
          <p className="text-muted-foreground">
            Cadastro de mercadorias com tributação versionada (ICMS regime antigo + IBS/CBS
            da Reforma).
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>Novo produto</Button>
      </header>

      <div className="max-w-md">
        <Input
          placeholder="Buscar por código ou descrição…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isLoading ? 'Carregando…' : `${data?.total ?? 0} produto(s)`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {data?.items?.length === 0 ? (
            <p className="text-muted-foreground">Nenhum produto cadastrado.</p>
          ) : null}
          {data?.items?.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between border-b border-border py-2 last:border-0"
            >
              <div>
                <div className="font-medium">
                  {p.codigo} · {p.descricao}
                </div>
                <div className="text-sm text-muted-foreground">
                  NCM {p.ncm} · {p.unidadeComercial} · origem {p.origem}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Modal
        open={open}
        title="Novo produto"
        description="Inclui regra tributária inicial vigente a partir de hoje. Edição completa entra em iteração futura."
        onClose={() => setOpen(false)}
        onConfirm={() => createMutation.mutate()}
        confirmLabel="Criar produto"
        loading={createMutation.isPending}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Código</Label>
            <Input
              value={form.codigo}
              onChange={(e) => setForm({ ...form, codigo: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>NCM</Label>
            <Input
              value={form.ncm}
              onChange={(e) => setForm({ ...form, ncm: e.target.value })}
              maxLength={8}
            />
          </div>
          <div className="col-span-2 space-y-1">
            <Label>Descrição</Label>
            <Input
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>CEST (opcional)</Label>
            <Input
              value={form.cest}
              onChange={(e) => setForm({ ...form, cest: e.target.value })}
              maxLength={7}
            />
          </div>
          <div className="space-y-1">
            <Label>Origem (0..8)</Label>
            <Input
              type="number"
              value={form.origem}
              onChange={(e) => setForm({ ...form, origem: Number(e.target.value) })}
              min={0}
              max={8}
            />
          </div>
          <div className="space-y-1">
            <Label>Unidade comercial</Label>
            <Input
              value={form.unidadeComercial}
              onChange={(e) => setForm({ ...form, unidadeComercial: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Unidade tributável</Label>
            <Input
              value={form.unidadeTributavel}
              onChange={(e) => setForm({ ...form, unidadeTributavel: e.target.value })}
            />
          </div>
          <div className="col-span-2 pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground mb-2">REGRA TRIBUTÁRIA INICIAL</p>
          </div>
          <div className="space-y-1">
            <Label>CST ICMS</Label>
            <Input
              value={form.cstIcms}
              onChange={(e) => setForm({ ...form, cstIcms: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Alíquota ICMS (%)</Label>
            <Input
              value={form.aliqIcms}
              onChange={(e) => setForm({ ...form, aliqIcms: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>CST IBS/CBS</Label>
            <Input
              value={form.cstIbsCbs}
              onChange={(e) => setForm({ ...form, cstIbsCbs: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>cClassTrib</Label>
            <Input
              value={form.cClassTrib}
              onChange={(e) => setForm({ ...form, cClassTrib: e.target.value })}
            />
          </div>
          {error ? <p className="col-span-2 text-sm text-destructive">{error}</p> : null}
        </div>
      </Modal>
    </div>
  );
}
