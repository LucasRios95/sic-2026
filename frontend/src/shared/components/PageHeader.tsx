import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  /** Ações alinhadas à direita do título (ex.: botão "Novo cliente"). */
  actions?: ReactNode;
}

/**
 * Cabeçalho padrão de página: título em fonte de display (Plus Jakarta Sans) com peso e
 * tracking consistentes, descrição em muted e um slot opcional de ações à direita.
 * Centraliza a tipografia dos títulos para todas as páginas ficarem uniformes.
 */
export function PageHeader({ title, description, actions }: PageHeaderProps): React.ReactElement {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
