import { describe, expect, it } from 'vitest';

import { CodigoRegimeTributario } from '@modules/Companies/infra/typeorm/entities/Company';
import { aplicarOverrideIcms } from '@modules/NFe/useCases/EmitirNFe/EmitirNFeUseCase';

const SIMPLES = CodigoRegimeTributario.SIMPLES_NACIONAL;
const NORMAL = CodigoRegimeTributario.REGIME_NORMAL;

// Regra base mínima (só os campos que a função lê/ajusta).
const regra = (over: Partial<{ cstIcms: string | null; csosnIcms: string | null; aliqIcms: string | null }> = {}) => ({
  cstIcms: null as string | null,
  csosnIcms: null as string | null,
  aliqIcms: '18.0000' as string | null,
  ...over,
});

describe('aplicarOverrideIcms', () => {
  it('sem override, devolve a própria regra (mesma referência)', () => {
    const r = regra({ cstIcms: '00' });
    expect(aplicarOverrideIcms(r, {}, NORMAL, 'P1')).toBe(r);
  });

  it('Simples + CSOSN sem ICMS próprio (102): seta CSOSN, limpa CST e zera alíquota', () => {
    const out = aplicarOverrideIcms(regra(), { csosnIcms: '102' }, SIMPLES, 'P1');
    expect(out.csosnIcms).toBe('102');
    expect(out.cstIcms).toBeNull();
    expect(out.aliqIcms).toBeNull(); // sem vICMS
  });

  it('Simples + CSOSN com crédito (101): mantém a alíquota da regra', () => {
    const out = aplicarOverrideIcms(regra(), { csosnIcms: '101' }, SIMPLES, 'P1');
    expect(out.csosnIcms).toBe('101');
    expect(out.aliqIcms).toBe('18.0000');
  });

  it('Regime Normal + CST tributado (00): seta CST, limpa CSOSN, mantém alíquota', () => {
    const out = aplicarOverrideIcms(regra(), { cstIcms: '00' }, NORMAL, 'P1');
    expect(out.cstIcms).toBe('00');
    expect(out.csosnIcms).toBeNull();
    expect(out.aliqIcms).toBe('18.0000');
  });

  it('Regime Normal + CST sem ICMS (41): zera a alíquota', () => {
    const out = aplicarOverrideIcms(regra(), { cstIcms: '41' }, NORMAL, 'P1');
    expect(out.cstIcms).toBe('41');
    expect(out.aliqIcms).toBeNull();
  });

  it('rejeita CST informado para empresa do Simples', () => {
    expect(() => aplicarOverrideIcms(regra(), { cstIcms: '00' }, SIMPLES, 'P1')).toThrow(
      /Simples Nacional usa CSOSN/,
    );
  });

  it('rejeita CSOSN informado para empresa do Regime Normal', () => {
    expect(() => aplicarOverrideIcms(regra(), { csosnIcms: '102' }, NORMAL, 'P1')).toThrow(
      /Regime Normal usa CST/,
    );
  });
});
