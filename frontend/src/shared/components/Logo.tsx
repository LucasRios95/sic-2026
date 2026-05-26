import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  variant?: 'full' | 'mark' | 'compact';
  /** Em fundo escuro, ativa o tratamento de cor invertida pro texto. */
  onDark?: boolean;
}

/**
 * Marca SIC NFe — três cilindros (azul, roxo, verde) representando dados/documentos
 * fiscais. Renderizado em SVG inline para escalar sem perda e herdar cores via Tailwind.
 *
 *  - `mark`    → só o símbolo, ideal pra sidebar colapsada/favicon.
 *  - `compact` → símbolo + "SIC NFe" sem tagline (header).
 *  - `full`    → símbolo + texto completo + tagline (tela de login, splash).
 */
export function Logo({ className, variant = 'compact', onDark = false }: LogoProps) {
  const sicColor = onDark ? 'text-slateDark-fg/70' : 'text-slate-300';
  const nfeColor = 'text-primary';
  const taglineColor = onDark ? 'text-slateDark-muted' : 'text-muted-foreground';

  return (
    <div className={cn('inline-flex items-center gap-3', className)}>
      <LogoMark className="shrink-0" />
      {variant !== 'mark' && (
        <div className="flex flex-col leading-none">
          <div className="flex items-baseline gap-1.5 font-bold tracking-tight">
            <span className={cn('text-2xl', sicColor)}>SIC</span>
            <span className={cn('text-2xl', nfeColor)}>NFe</span>
          </div>
          {variant === 'full' && (
            <p
              className={cn(
                'mt-2 text-[10px] font-medium uppercase tracking-[0.22em]',
                taglineColor,
              )}
            >
              Sistema de Nota Fiscal Eletrônica
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width="40"
      height="40"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="SIC NFe"
      className={className}
    >
      {/* Cilindros stacked com offset, mimetizando o logo */}
      <rect x="4" y="14" width="14" height="38" rx="7" fill="#3B82F6" />
      <rect x="22" y="6" width="14" height="46" rx="7" fill="#7C3AED" />
      <rect x="40" y="20" width="14" height="32" rx="7" fill="#10B981" />
      {/* Elipse base */}
      <ellipse cx="14" cy="58" rx="6" ry="2" fill="#10B981" opacity="0.5" />
    </svg>
  );
}
