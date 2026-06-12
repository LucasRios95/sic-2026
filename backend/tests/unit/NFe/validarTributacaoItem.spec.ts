import { describe, expect, it } from 'vitest';

import { CodigoRegimeTributario } from '@modules/Companies/infra/typeorm/entities/Company';
import { validarTributacaoItem } from '@modules/NFe/useCases/EmitirNFe/EmitirNFeUseCase';

const SIMPLES = CodigoRegimeTributario.SIMPLES_NACIONAL;
const NORMAL = CodigoRegimeTributario.REGIME_NORMAL;

describe('validarTributacaoItem', () => {
  it('Simples com CSOSN + cClassTrib válido: sem erros', () => {
    const erros = validarTributacaoItem(
      { csosnIcms: '102', cstIbsCbs: 'TRIBUTACAO_INTEGRAL', cClassTrib: '000001' },
      SIMPLES,
      'P1',
    );
    expect(erros).toEqual([]);
  });

  it('detecta cClassTrib placeholder 100000', () => {
    const erros = validarTributacaoItem(
      { csosnIcms: '102', cstIbsCbs: 'TRIBUTACAO_INTEGRAL', cClassTrib: '100000' },
      SIMPLES,
      'P1',
    );
    expect(erros.join()).toMatch(/cClassTrib "100000" não existe/);
  });

  it('detecta cClassTrib fora do formato 6 dígitos', () => {
    const erros = validarTributacaoItem(
      { csosnIcms: '102', cstIbsCbs: 'TRIBUTACAO_INTEGRAL', cClassTrib: '12' },
      SIMPLES,
      'P1',
    );
    expect(erros.join()).toMatch(/ausente ou inválido/);
  });

  it('Simples com CST de ICMS em vez de CSOSN: erro', () => {
    const erros = validarTributacaoItem({ cstIcms: '00' }, SIMPLES, 'P1');
    expect(erros.join()).toMatch(/Simples Nacional exige CSOSN/);
  });

  it('Regime Normal sem CST de ICMS: erro', () => {
    const erros = validarTributacaoItem({ csosnIcms: '102' }, NORMAL, 'P1');
    expect(erros.join()).toMatch(/Regime Normal exige CST/);
  });

  it('Regime Normal sem PIS/COFINS: dois erros', () => {
    const erros = validarTributacaoItem({ cstIcms: '00' }, NORMAL, 'P1');
    expect(erros.join()).toMatch(/sem CST de PIS/);
    expect(erros.join()).toMatch(/sem CST de COFINS/);
  });

  it('Simples sem PIS/COFINS: ok (builder usa CST 49 zerado)', () => {
    const erros = validarTributacaoItem({ csosnIcms: '102' }, SIMPLES, 'P1');
    expect(erros).toEqual([]);
  });

  it('sem IBS/CBS configurado: não cobra cClassTrib', () => {
    const erros = validarTributacaoItem({ csosnIcms: '102' }, SIMPLES, 'P1');
    expect(erros.join()).not.toMatch(/cClassTrib/);
  });
});
