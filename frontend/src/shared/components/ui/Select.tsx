import { forwardRef, SelectHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

/**
 * Select nativo — uso simples (5+ páginas existentes). Para forms novos com UX rica,
 * use os componentes em `./SelectRich.tsx` baseados em Radix Select.
 */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...rest }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground ring-offset-background transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:border-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';
