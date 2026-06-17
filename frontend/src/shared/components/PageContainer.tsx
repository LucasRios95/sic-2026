import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

const MAX_WIDTH = {
  default: 'max-w-6xl',
  wide: 'max-w-7xl',
  narrow: 'max-w-3xl',
  full: 'max-w-none',
} as const;

interface PageContainerProps {
  children: ReactNode;
  /** Largura máxima do conteúdo. `default` cobre a maioria; `wide` p/ tabelas densas (Produtos). */
  maxWidth?: keyof typeof MAX_WIDTH;
  className?: string;
}

/**
 * Container padrão de página. Centraliza o padding em relação à sidebar/header e o
 * espaçamento vertical entre blocos — todas as páginas usam isto para terem o mesmo
 * "respiro". Evita o padding duplo: o `<main>` do AppLayout não tem padding próprio.
 */
export function PageContainer({
  children,
  maxWidth = 'default',
  className,
}: PageContainerProps): React.ReactElement {
  return (
    <div className="p-6 lg:p-8">
      <div className={cn('mx-auto w-full space-y-6', MAX_WIDTH[maxWidth], className)}>
        {children}
      </div>
    </div>
  );
}
