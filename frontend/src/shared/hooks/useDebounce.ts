import { useEffect, useState } from 'react';

/**
 * Debounce simples — útil para inputs e campos que disparam side-effects pesados
 * (chamadas a /tax/simulate, busca por digitação).
 */
export function useDebounce<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
