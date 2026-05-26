import { ChevronDown, Loader2, X } from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { cn } from '@/lib/utils';

import { Input } from './Input';

export interface ComboboxOption {
  value: string;
  label: string;
  /** Render rico opcional (ex.: código + descrição em duas linhas). Quando omitido, usa `label`. */
  render?: ReactNode;
}

interface SearchComboboxProps {
  value: string;
  onChange: (value: string) => void;
  /** Função de busca remota — chamada com debounce. */
  fetchOptions: (search: string) => Promise<ComboboxOption[]>;
  /** Carrega o label/render do item já selecionado (ex.: editar produto com NCM existente). */
  loadSelected?: (value: string) => Promise<ComboboxOption | null>;
  placeholder?: string;
  disabled?: boolean;
  /** Texto vazio quando não há resultados. */
  emptyHint?: string;
  /** Permite limpar. */
  clearable?: boolean;
  /** Padding de classes externas. */
  className?: string;
  required?: boolean;
}

/**
 * Combobox com busca remota. Pensado pra catálogos grandes (NCM 15k, CFOP 165, etc.)
 * onde um `<select>` nativo seria impraticável. Padrão "type to filter" — sem
 * dependência externa (cmdk/downshift) pra manter o bundle leve.
 *
 * Comportamento:
 *  - Foco abre o dropdown com últimos resultados.
 *  - Digitar dispara `fetchOptions` com 250ms de debounce.
 *  - Clicar/Enter seleciona; o display passa a mostrar o label do selecionado.
 *  - Esc/clique fora fecha.
 *  - `loadSelected` é chamado uma vez quando `value` muda externamente.
 */
export const SearchCombobox = forwardRef<HTMLInputElement, SearchComboboxProps>(
  (
    {
      value,
      onChange,
      fetchOptions,
      loadSelected,
      placeholder = 'Buscar…',
      disabled,
      emptyHint = 'Nenhum resultado',
      clearable = true,
      className,
      required,
    },
    ref,
  ) => {
    const id = useId();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [options, setOptions] = useState<ComboboxOption[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedLabel, setSelectedLabel] = useState<ReactNode>('');
    const containerRef = useRef<HTMLDivElement>(null);

    // Carrega o label inicial quando há value mas nenhum label conhecido (modo edição).
    useEffect(() => {
      if (!value) {
        setSelectedLabel('');
        return;
      }
      if (loadSelected) {
        let cancelled = false;
        void loadSelected(value).then((opt) => {
          if (!cancelled && opt) setSelectedLabel(opt.render ?? opt.label);
        });
        return () => {
          cancelled = true;
        };
      }
    }, [value, loadSelected]);

    // Busca com debounce.
    const debouncedFetch = useDebouncedCallback(async (term: string) => {
      setLoading(true);
      try {
        const opts = await fetchOptions(term);
        setOptions(opts);
      } finally {
        setLoading(false);
      }
    }, 250);

    useEffect(() => {
      if (open) {
        void debouncedFetch(query);
      }
    }, [open, query, debouncedFetch]);

    // Fecha ao clicar fora.
    useEffect(() => {
      function handleClickOutside(e: MouseEvent) {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setOpen(false);
        }
      }
      if (open) {
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
      }
    }, [open]);

    function pick(opt: ComboboxOption): void {
      onChange(opt.value);
      setSelectedLabel(opt.render ?? opt.label);
      setQuery('');
      setOpen(false);
    }

    function clear(): void {
      onChange('');
      setSelectedLabel('');
      setQuery('');
    }

    return (
      <div ref={containerRef} className={cn('relative', className)}>
        {!open ? (
          <button
            type="button"
            onClick={() => !disabled && setOpen(true)}
            disabled={disabled}
            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground hover:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            aria-haspopup="listbox"
          >
            <span className={cn('truncate', !selectedLabel && 'text-muted-foreground')}>
              {selectedLabel || placeholder}
            </span>
            <div className="flex items-center gap-1">
              {clearable && value && !required && (
                <X
                  className="h-4 w-4 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    clear();
                  }}
                />
              )}
              <ChevronDown className="h-4 w-4 opacity-60" />
            </div>
          </button>
        ) : (
          <>
            <Input
              ref={ref}
              id={id}
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              disabled={disabled}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setOpen(false);
                if (e.key === 'Enter' && options[0]) {
                  e.preventDefault();
                  pick(options[0]);
                }
              }}
            />
            <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-md border bg-popover shadow-elevated">
              {loading ? (
                <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Buscando…
                </div>
              ) : options.length === 0 ? (
                <div className="px-3 py-3 text-sm text-muted-foreground">{emptyHint}</div>
              ) : (
                <ul role="listbox" className="py-1">
                  {options.map((opt) => (
                    <li
                      key={opt.value}
                      role="option"
                      aria-selected={opt.value === value}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pick(opt);
                      }}
                      className={cn(
                        'cursor-pointer px-3 py-2 text-sm hover:bg-primary-soft hover:text-foreground',
                        opt.value === value && 'bg-primary-soft text-primary font-medium',
                      )}
                    >
                      {opt.render ?? opt.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    );
  },
);
SearchCombobox.displayName = 'SearchCombobox';

/**
 * useDebouncedCallback minimalista — evita criar nova promise/timer a cada keystroke.
 * Padrão "deixar o último ganhar".
 */
function useDebouncedCallback<Args extends unknown[]>(
  fn: (...args: Args) => void | Promise<void>,
  delay: number,
): (...args: Args) => void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback(
    (...args: Args) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void fn(...args);
      }, delay);
    },
    [fn, delay],
  );
}
