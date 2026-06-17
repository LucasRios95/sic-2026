import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Calculator, Package, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { deleteProduct, listProducts } from '@/features/products/products-api';
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
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { Input } from '@/shared/components/ui/Input';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { Pagination } from '@/shared/components/ui/Pagination';
import { usePagination } from '@/shared/hooks/usePagination';
import type { Product } from '@/shared/types/fiscal';

export function ProductsPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const pagination = usePagination({ initialPageSize: 50 });

  useEffect(() => {
    pagination.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['products', search, pagination.page, pagination.pageSize],
    queryFn: () =>
      listProducts({
        search: search || undefined,
        limit: pagination.pageSize,
        offset: pagination.offset,
      }),
    placeholderData: (prev) => prev,
  });

  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const deleteMutation = useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => {
      toast.success(`Produto "${deleteTarget?.codigo}" excluído!`);
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Falha ao excluir produto'),
  });

  function goEdit(id: string): void {
    void navigate({ to: '/cadastros/products/$id/edit', params: { id } });
  }

  return (
    <PageContainer maxWidth="wide">
      <PageHeader
        title="Produtos"
        description="Mercadorias com tributação versionada. NCM e CFOPs são puxados dos catálogos oficiais."
        actions={
          <Button variant="primary" className="gap-2" onClick={() => void navigate({ to: '/cadastros/products/new' })}>
            <Plus className="h-4 w-4" />
            Novo produto
          </Button>
        }
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por código ou descrição..."
          className="pl-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <Card className="p-10 text-center border-0 shadow-card text-sm text-muted-foreground">
          Carregando produtos…
        </Card>
      ) : (data?.items?.length ?? 0) === 0 ? (
        <Card className="p-10 text-center border-0 shadow-card">
          <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="font-medium text-sm">
            {search ? 'Nenhum produto encontrado.' : 'Nenhum produto cadastrado ainda.'}
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data!.items.map((p) => (
              <Card key={p.id} className="p-5 border-0 shadow-card hover:shadow-card-hover transition-all">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-primary/10 p-2.5 shrink-0">
                    <Package className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs text-muted-foreground">{p.codigo}</p>
                    <h3 className="font-semibold text-foreground line-clamp-2">{p.descricao}</h3>
                  </div>
                  <div className="flex items-start gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => goEdit(p.id)}
                      aria-label={`Regra tributária de ${p.codigo}`}
                      title="Regra tributária"
                    >
                      <Calculator className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => goEdit(p.id)}
                      aria-label={`Editar ${p.codigo}`}
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(p)}
                      aria-label={`Excluir ${p.codigo}`}
                      title="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-border space-y-1 text-xs">
                  <Row label="NCM" value={p.ncm} mono />
                  <Row label="Unidade" value={p.unidadeComercial} />
                  <Row label="Origem" value={String(p.origem)} />
                </div>
              </Card>
            ))}
          </div>
          <Pagination
            total={data?.total ?? 0}
            page={pagination.page}
            pageSize={pagination.pageSize}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
            isLoading={isLoading}
            className="pt-2"
          />
        </>
      )}

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.codigo}</strong> — {deleteTarget?.descricao} será marcado como
              inativo. Itens já emitidos em NF-e não são afetados. A exclusão será rejeitada pelo
              backend caso exista regra tributária vigente ou futura para este produto.
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

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-foreground font-medium ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
