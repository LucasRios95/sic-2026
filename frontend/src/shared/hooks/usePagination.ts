import { useCallback, useMemo, useState } from 'react';

export interface UsePaginationOptions {
  initialPage?: number;
  initialPageSize?: number;
}

export interface UsePaginationResult {
  page: number;
  pageSize: number;
  /** offset (zero-indexed) calculado a partir de page/pageSize, pronto para envio ao backend. */
  offset: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  /** Reseta para a página 1 — útil ao mudar filtros de busca. */
  reset: () => void;
}

const DEFAULT_PAGE_SIZE = 50;

/**
 * Encapsula o estado de paginação (1-indexed para UI, mas converte para `offset`
 * 0-indexed exigido pelo backend). Trocar pageSize volta automaticamente para a
 * primeira página — caso contrário, ficaríamos numa página inexistente.
 *
 * Uso típico:
 *   const pagination = usePagination({ initialPageSize: 50 });
 *   const { data } = useQuery({
 *     queryKey: ['customers', search, pagination.page, pagination.pageSize],
 *     queryFn: () => listCustomers({ search, limit: pagination.pageSize, offset: pagination.offset }),
 *   });
 *   <Pagination total={data.total} page={pagination.page} pageSize={pagination.pageSize}
 *     onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />
 */
export function usePagination(options: UsePaginationOptions = {}): UsePaginationResult {
  const [page, setPageState] = useState(options.initialPage ?? 1);
  const [pageSize, setPageSizeState] = useState(options.initialPageSize ?? DEFAULT_PAGE_SIZE);

  const setPage = useCallback((p: number) => {
    setPageState(Math.max(1, Math.floor(p)));
  }, []);

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(Math.max(1, Math.floor(size)));
    setPageState(1);
  }, []);

  const reset = useCallback(() => setPageState(1), []);

  const offset = useMemo(() => (page - 1) * pageSize, [page, pageSize]);

  return { page, pageSize, offset, setPage, setPageSize, reset };
}
