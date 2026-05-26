import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { listNFes } from '@/features/nfe/nfe-api';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/Card';
import { Input } from '@/shared/components/ui/Input';
import { Pagination } from '@/shared/components/ui/Pagination';
import { Select } from '@/shared/components/ui/Select';
import { usePagination } from '@/shared/hooks/usePagination';
import { STATUS_LABEL, STATUS_STYLES } from '@/shared/types/fiscal';
import type { DocumentStatus } from '@/shared/types/fiscal';

const STATUSES: DocumentStatus[] = [
  'DRAFT',
  'PENDING',
  'PROCESSING',
  'AUTHORIZED',
  'REJECTED',
  'DENIED',
  'CANCELLED',
];

export function NFeListPage(): React.ReactElement {
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | ''>('');
  const [search, setSearch] = useState('');
  const pagination = usePagination({ initialPageSize: 50 });

  useEffect(() => {
    pagination.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, search]);

  const { data, isLoading } = useQuery({
    queryKey: ['nfe', statusFilter, search, pagination.page, pagination.pageSize],
    queryFn: () =>
      listNFes({
        status: statusFilter || undefined,
        search: search || undefined,
        limit: pagination.pageSize,
        offset: pagination.offset,
      }),
    placeholderData: (prev) => prev,
  });

  return (
    <div className="space-y-6 max-w-6xl">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">NF-e emitidas</h1>
          <p className="text-muted-foreground">
            Notas Fiscais Eletrônicas modelo 55 da empresa selecionada.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/fiscal/nfe/inutilizar">
            <Button variant="outline">Inutilizar faixa</Button>
          </Link>
          <Link to="/fiscal/nfe/new" search={{ reissueFrom: undefined }}>
            <Button>Emitir nova NF-e</Button>
          </Link>
        </div>
      </header>

      <div className="flex gap-3">
        <Input
          className="max-w-md"
          placeholder="Buscar por chave ou número…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          className="max-w-xs"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as DocumentStatus | '')}
        >
          <option value="">Todos os status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isLoading ? 'Carregando…' : `${data?.total ?? 0} NF-e`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data?.items?.length === 0 ? (
            <p className="text-muted-foreground">
              Nenhuma NF-e encontrada com os filtros atuais.
            </p>
          ) : null}
          {data?.items?.map((nfe) => (
            <Link
              key={nfe.id}
              to="/fiscal/nfe/$id"
              params={{ id: nfe.id }}
              className="block border-b border-border py-3 last:border-0 hover:bg-muted/40 -mx-6 px-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">
                    Nº {String(nfe.numero).padStart(9, '0')} · Série {nfe.serie}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {nfe.naturezaOperacao} · {new Date(nfe.dhEmissao).toLocaleString('pt-BR')}
                  </div>
                  {nfe.chaveAcesso ? (
                    <div className="text-xs font-mono text-muted-foreground">
                      {nfe.chaveAcesso}
                    </div>
                  ) : null}
                </div>
                <div className="text-right space-y-1">
                  <Badge className={STATUS_STYLES[nfe.status]}>
                    {STATUS_LABEL[nfe.status]}
                  </Badge>
                  <div className="text-sm font-medium">R$ {nfe.valorTotal}</div>
                  {nfe.cStat ? (
                    <div className="text-xs text-muted-foreground">cStat {nfe.cStat}</div>
                  ) : null}
                </div>
              </div>
            </Link>
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
    </div>
  );
}
