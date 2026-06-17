import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Pencil, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { deleteCustomer, listCustomers } from '@/features/customers/customers-api';
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
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { Pagination } from '@/shared/components/ui/Pagination';
import { usePagination } from '@/shared/hooks/usePagination';
import type { Customer } from '@/shared/types/fiscal';

export function CustomersPage(): React.ReactElement {
  const [search, setSearch] = useState('');
  const pagination = usePagination({ initialPageSize: 50 });
  const queryClient = useQueryClient();
  const navigate = useNavigate();

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

  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const deleteMutation = useMutation({
    mutationFn: deleteCustomer,
    onSuccess: () => {
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  return (
    <PageContainer maxWidth="wide">
      <PageHeader
        title="Clientes"
        description="Cadastro de destinatários com atributos fiscais (CRT, indicador IE, consumidor final)."
        actions={
          <Button onClick={() => void navigate({ to: '/cadastros/customers/new' })}>
            Novo cliente
          </Button>
        }
      />

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
                  onClick={() => void navigate({ to: '/cadastros/customers/$id/edit', params: { id: c.id } })}
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
    </PageContainer>
  );
}
