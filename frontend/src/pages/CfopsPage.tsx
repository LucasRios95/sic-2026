import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  FileText,
  Globe2,
  Pencil,
  Plus,
  Search,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';

import {
  listCfops,
  type Cfop,
  type CfopEscopo,
  type CfopTipoOperacao,
} from '@/features/cfops/cfops-api';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { Input } from '@/shared/components/ui/Input';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { Select } from '@/shared/components/ui/Select';

export function CfopsPage(): React.ReactElement {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [tipoFilter, setTipoFilter] = useState<CfopTipoOperacao | ''>('');
  const [escopoFilter, setEscopoFilter] = useState<CfopEscopo | ''>('');
  const [apenasCredito, setApenasCredito] = useState(false);

  const { data: cfops = [], isLoading } = useQuery({
    queryKey: ['cfops', { search, tipoFilter, escopoFilter, apenasCredito }],
    queryFn: () =>
      listCfops({
        search: search || undefined,
        tipoOperacao: tipoFilter || undefined,
        escopo: escopoFilter || undefined,
        apenasGeraCredito: apenasCredito,
      }),
  });

  return (
    <PageContainer maxWidth="wide">
      <PageHeader
        title="CFOPs"
        description={`Códigos Fiscais de Operações e Prestações usados pelos itens da NF-e.${!isLoading ? ` ${cfops.length} cadastrados.` : ''}`}
        actions={
          <Button variant="primary" className="gap-2" onClick={() => void navigate({ to: '/admin/cfops/new' })}>
            <Plus className="h-4 w-4" />
            Novo CFOP
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por código, descrição ou grupo..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={tipoFilter} onChange={(e) => setTipoFilter(e.target.value as CfopTipoOperacao | '')}>
          <option value="">Todos os tipos</option>
          <option value="ENTRADA">Entrada</option>
          <option value="SAIDA">Saída</option>
        </Select>
        <Select value={escopoFilter} onChange={(e) => setEscopoFilter(e.target.value as CfopEscopo | '')}>
          <option value="">Todos os escopos</option>
          <option value="ESTADUAL">Estadual</option>
          <option value="INTERESTADUAL">Interestadual</option>
          <option value="EXTERIOR">Exterior</option>
        </Select>
      </div>

      <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-foreground">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-ring"
          checked={apenasCredito}
          onChange={(e) => setApenasCredito(e.target.checked)}
        />
        Mostrar só operações que geram crédito PIS/COFINS
      </label>

      {isLoading ? (
        <Card className="p-10 text-center border-0 shadow-card text-sm text-muted-foreground">
          Carregando catálogo de CFOPs…
        </Card>
      ) : cfops.length === 0 ? (
        <Card className="p-10 text-center border-0 shadow-card">
          <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="font-medium text-sm">
            {search || tipoFilter || escopoFilter || apenasCredito
              ? 'Nenhum CFOP encontrado com esses filtros.'
              : 'Catálogo vazio. Rode o seed do backend para popular.'}
          </p>
        </Card>
      ) : (
        <Card className="border-0 shadow-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {['Código', 'Descrição', 'Tipo', 'Escopo', 'Grupo', 'PIS/COFINS', ''].map((h) => (
                  <th
                    key={h}
                    className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cfops.map((c) => (
                <CfopRow
                  key={c.id}
                  cfop={c}
                  onEdit={() => void navigate({ to: '/admin/cfops/$id/edit', params: { id: c.id } })}
                />
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </PageContainer>
  );
}

function CfopRow({ cfop, onEdit }: { cfop: Cfop; onEdit: () => void }): React.ReactElement {
  return (
    <tr className="hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3 font-mono font-semibold text-foreground">{cfop.codigo}</td>
      <td className="px-4 py-3 text-foreground max-w-md">
        <div className="line-clamp-2">{cfop.descricao}</div>
        {!cfop.ativo && (
          <span className="inline-block mt-1 rounded-md bg-warning-soft px-1.5 py-0.5 text-[10px] font-semibold text-warning-foreground">
            INATIVO
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <TipoBadge tipo={cfop.tipoOperacao} />
      </td>
      <td className="px-4 py-3">
        <EscopoBadge escopo={cfop.escopo} />
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{cfop.grupo ?? '—'}</td>
      <td className="px-4 py-3 text-center">
        {cfop.geraCreditoPisCofins ? (
          <CheckCircle2 className="h-4 w-4 text-success mx-auto" />
        ) : (
          <XCircle className="h-4 w-4 text-muted-foreground/40 mx-auto" />
        )}
      </td>
      <td className="px-4 py-3">
        <button
          onClick={onEdit}
          className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Editar CFOP"
          aria-label="Editar"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

function TipoBadge({ tipo }: { tipo: CfopTipoOperacao }): React.ReactElement {
  if (tipo === 'ENTRADA') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-info-soft px-1.5 py-0.5 text-[10px] font-semibold text-info">
        <ArrowDownLeft className="h-3 w-3" /> ENTRADA
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-primary-soft px-1.5 py-0.5 text-[10px] font-semibold text-primary">
      <ArrowUpRight className="h-3 w-3" /> SAÍDA
    </span>
  );
}

function EscopoBadge({ escopo }: { escopo: CfopEscopo }): React.ReactElement {
  const config = {
    ESTADUAL: { label: 'Estadual', cls: 'bg-muted text-foreground' },
    INTERESTADUAL: { label: 'Interestadual', cls: 'bg-accent-soft text-accent' },
    EXTERIOR: { label: 'Exterior', cls: 'bg-warning-soft text-warning-foreground' },
  } as const;
  const c = config[escopo];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${c.cls}`}>
      <Globe2 className="h-3 w-3" />
      {c.label}
    </span>
  );
}
