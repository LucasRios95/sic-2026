import { describe, expect, it } from 'vitest';

import { Money } from '@shared/domain/Money';

describe('Money', () => {
  it('soma sem erros de ponto flutuante', () => {
    const r = new Money('0.1').add('0.2');
    expect(r.toString(2)).toBe('0.30');
  });

  it('applyPercent multiplica por aliquota/100', () => {
    expect(new Money('100').applyPercent('18').toString(2)).toBe('18.00');
    expect(new Money('250').applyPercent('7').toString(2)).toBe('17.50');
  });

  it('arredonda HALF_EVEN para 2 casas', () => {
    expect(new Money('1.005').round(2).toString(2)).toBe('1.00'); // banker's: 0 par
    expect(new Money('1.015').round(2).toString(2)).toBe('1.02'); // 2 par
    expect(new Money('1.025').round(2).toString(2)).toBe('1.02'); // 2 par
    expect(new Money('1.035').round(2).toString(2)).toBe('1.04'); // 4 par
  });

  it('encadeamento sub/add/mul/div mantém precisão', () => {
    const r = new Money('100').mul('0.18').div('1').sub('0.005').add('0.001');
    // 18 - 0.005 + 0.001 = 17.996 → 18.00 (HALF_EVEN com tail 96 vai para par superior)
    expect(r.round(2).toString(2)).toBe('18.00');
  });
});
