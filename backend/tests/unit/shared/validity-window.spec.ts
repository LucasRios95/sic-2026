import { describe, expect, it } from 'vitest';

import { hasOverlap } from '@shared/domain/validity-window';

const d = (iso: string) => new Date(iso);

describe('hasOverlap', () => {
  it('janela aberta nova vs nenhuma existente → sem sobreposição', () => {
    expect(hasOverlap({ validFrom: d('2026-01-01T00:00:00Z') }, [])).toBe(false);
  });

  it('detecta sobreposição entre duas janelas abertas', () => {
    const existing = [{ id: 'a', validFrom: d('2025-01-01T00:00:00Z'), validTo: null }];
    expect(hasOverlap({ validFrom: d('2026-01-01T00:00:00Z') }, existing)).toBe(true);
  });

  it('janela fechada que termina exatamente quando a nova começa → sem sobreposição (validTo é exclusivo)', () => {
    const existing = [
      { id: 'a', validFrom: d('2025-01-01T00:00:00Z'), validTo: d('2026-01-01T00:00:00Z') },
    ];
    expect(
      hasOverlap(
        { validFrom: d('2026-01-01T00:00:00Z'), validTo: d('2027-01-01T00:00:00Z') },
        existing,
      ),
    ).toBe(false);
  });

  it('janela nova totalmente contida em existente → sobreposição', () => {
    const existing = [
      { id: 'a', validFrom: d('2025-01-01T00:00:00Z'), validTo: d('2027-01-01T00:00:00Z') },
    ];
    expect(
      hasOverlap(
        { validFrom: d('2026-01-01T00:00:00Z'), validTo: d('2026-06-01T00:00:00Z') },
        existing,
      ),
    ).toBe(true);
  });

  it('janela nova com início antes e fim depois da existente → sobreposição', () => {
    const existing = [
      { id: 'a', validFrom: d('2026-01-01T00:00:00Z'), validTo: d('2026-06-01T00:00:00Z') },
    ];
    expect(
      hasOverlap(
        { validFrom: d('2025-01-01T00:00:00Z'), validTo: d('2027-01-01T00:00:00Z') },
        existing,
      ),
    ).toBe(true);
  });

  it('excludeId ignora a própria linha durante update', () => {
    const existing = [{ id: 'a', validFrom: d('2025-01-01T00:00:00Z'), validTo: null }];
    expect(
      hasOverlap({ validFrom: d('2025-06-01T00:00:00Z') }, existing, 'a'),
    ).toBe(false);
  });

  it('rejeita janela inválida (validTo ≤ validFrom)', () => {
    expect(() =>
      hasOverlap(
        { validFrom: d('2026-06-01T00:00:00Z'), validTo: d('2026-01-01T00:00:00Z') },
        [],
      ),
    ).toThrow(/validTo/);
  });
});
