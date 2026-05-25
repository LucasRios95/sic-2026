import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { createCustomer, listCustomers } from '@/features/customers/customers-api';
import { ApiError } from '@/lib/api';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/Card';
import { Input } from '@/shared/components/ui/Input';
import { Label } from '@/shared/components/ui/Label';
import { Modal } from '@/shared/components/ui/Modal';
import { Select } from '@/shared/components/ui/Select';
import type { TipoPessoa } from '@/shared/types/fiscal';

export function CustomersPage(): React.ReactElement {
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['customers', search],
    queryFn: () => listCustomers({ search: search || undefined, limit: 100 }),
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    tipoPessoa: 'PJ' as TipoPessoa,
    cnpjCpf: '',
    nomeRazao: '',
    indicadorIE: 'CONTRIBUINTE' as const,
    email: '',
    consumidorFinal: false,
    logradouro: '',
    numero: '',
    bairro: '',
    codigoMunicipioIbge: '',
    municipio: '',
    uf: '',
    cep: '',
  });
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: createCustomer,
    onSuccess: () => {
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Falha ao criar cliente'),
  });

  return (
    <div className="space-y-6 max-w-6xl">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground">
            Cadastro de destinatários com atributos fiscais (CRT, indicador IE, consumidor final).
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>Novo cliente</Button>
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
              className="flex items-center justify-between border-b border-border py-2 last:border-0"
            >
              <div>
                <div className="font-medium">{c.nomeRazao}</div>
                <div className="text-sm text-muted-foreground">
                  {c.tipoPessoa} · {c.cnpjCpf} · {c.municipio}/{c.uf}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {c.consumidorFinal ? (
                  <Badge className="bg-blue-100 text-blue-800">Consumidor final</Badge>
                ) : null}
                <Badge className="bg-muted text-muted-foreground">{c.indicadorIE}</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Modal
        open={open}
        title="Novo cliente"
        description="Campos mínimos para uso em emissão de NF-e."
        onClose={() => setOpen(false)}
        onConfirm={() => createMutation.mutate(form)}
        confirmLabel="Criar"
        loading={createMutation.isPending}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Tipo de pessoa</Label>
            <Select
              value={form.tipoPessoa}
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
                setForm({ ...form, indicadorIE: e.target.value as typeof form.indicadorIE })
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
            <Input value={form.cep} onChange={(e) => setForm({ ...form, cep: e.target.value })} />
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
          {error ? <p className="col-span-2 text-sm text-destructive">{error}</p> : null}
        </div>
      </Modal>
    </div>
  );
}
