import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

import { Button } from './Button';
import { Select } from './Select';

export interface PaginationProps {
  /** Total de itens disponível no servidor (vem do meta.total). */
  total: number;
  /** Página atual, 1-indexed. */
  page: number;
  /** Itens por página. */
  pageSize: number;
  /** Disparado ao trocar de página. Recebe o novo número (1-indexed). */
  onPageChange: (page: number) => void;
  /** Disparado ao trocar o tamanho da página. */
  onPageSizeChange?: (size: number) => void;
  /** Opções de page size oferecidas no dropdown. */
  pageSizeOptions?: number[];
  /** Quando true, mostra "Carregando..." no lugar do total. */
  isLoading?: boolean;
  className?: string;
}

const DEFAULT_PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

/**
 * Paginação stateless. O componente recebe `page` + `pageSize` e dispara callbacks
 * — o estado vive na página que o usa, normalmente como state local + TanStack Query.
 *
 * Limite do backend: max 200 por chamada (ListCustomersQuerySchema etc.).
 */
export function Pagination({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  isLoading = false,
  className,
}: PaginationProps): React.ReactElement | null {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const firstItem = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const lastItem = Math.min(safePage * pageSize, total);

  // Não mostra paginação quando há menos itens que o menor page size
  if (total === 0 && !isLoading) return null;

  return (
    <div
      className={[
        'flex flex-wrap items-center justify-between gap-3 text-sm',
        className ?? '',
      ].join(' ')}
    >
      <div className="text-muted-foreground">
        {isLoading
          ? 'Carregando...'
          : total === 0
            ? 'Nenhum resultado'
            : `Mostrando ${firstItem.toLocaleString('pt-BR')}–${lastItem.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')}`}
      </div>

      <div className="flex items-center gap-2">
        {onPageSizeChange ? (
          <label className="flex items-center gap-2 text-muted-foreground">
            <span className="hidden sm:inline">Por página:</span>
            <Select
              value={String(pageSize)}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-8 w-20"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </Select>
          </label>
        ) : null}

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={safePage === 1 || isLoading}
            onClick={() => onPageChange(1)}
            aria-label="Primeira página"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={safePage === 1 || isLoading}
            onClick={() => onPageChange(safePage - 1)}
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <span className="px-2 text-foreground tabular-nums">
            <strong>{safePage}</strong>
            <span className="text-muted-foreground"> / {totalPages.toLocaleString('pt-BR')}</span>
          </span>

          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={safePage >= totalPages || isLoading}
            onClick={() => onPageChange(safePage + 1)}
            aria-label="Próxima página"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={safePage >= totalPages || isLoading}
            onClick={() => onPageChange(totalPages)}
            aria-label="Última página"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
