import { describe, expect, it } from 'vitest';

import { validarStCalculada } from '@modules/NFe/useCases/EmitirNFe/EmitirNFeUseCase';

const semSt = {
  calculadorasNaoAplicadas: {},
  warnings: [
    'Produto NCM 22060090 sem MVA cadastrada (nem global em icms_st_mva, nem pMVAST no produto)',
  ],
};

describe('validarStCalculada', () => {
  it('CSOSN 202 sem ST calculada (sem MVA): barra com o motivo do motor', () => {
    const erros = validarStCalculada({ csosnIcms: '202' }, semSt, '2217', '22060090', 'MG');
    expect(erros).toHaveLength(1);
    expect(erros[0]).toMatch(/Produto 2217 \(NCM 22060090\): CSOSN 202 exige ICMS-ST/);
    expect(erros[0]).toMatch(/sem MVA cadastrada/);
    expect(erros[0]).toMatch(/CSOSN sem ST/);
  });

  it('ST desligada na empresa vira o motivo', () => {
    const erros = validarStCalculada(
      { csosnIcms: '201' },
      { calculadorasNaoAplicadas: { 'icms-st': 'ICMS-ST desligado na configuração da empresa' }, warnings: [] },
      'P1',
      '22042100',
      'MG',
    );
    expect(erros[0]).toMatch(/ICMS-ST desligado/);
  });

  it('CST 10 sem ST calculada também barra', () => {
    const erros = validarStCalculada({ cstIcms: '10' }, semSt, 'P1', '22060090', 'MG');
    expect(erros[0]).toMatch(/CST 10 exige ICMS-ST/);
  });

  it('base de ST zerada é incoerente com CSOSN 202', () => {
    const erros = validarStCalculada(
      { csosnIcms: '202' },
      { baseIcmsST: '0.00', calculadorasNaoAplicadas: {}, warnings: [] },
      '3008',
      '22041010',
      'MG',
    );
    expect(erros[0]).toMatch(/base de ICMS-ST zerada/);
  });

  it('ST calculada ou código sem ST obrigatória: sem erros', () => {
    const ok = { baseIcmsST: '387.56', calculadorasNaoAplicadas: {}, warnings: [] };
    expect(validarStCalculada({ csosnIcms: '202' }, ok, 'P1', '22042100', 'MG')).toEqual([]);
    expect(validarStCalculada({ csosnIcms: '102' }, semSt, 'P1', '22060090', 'MG')).toEqual([]);
    expect(validarStCalculada({ csosnIcms: '900' }, semSt, 'P1', '22060090', 'MG')).toEqual([]);
    expect(validarStCalculada({ cstIcms: '90' }, semSt, 'P1', '22060090', 'MG')).toEqual([]);
  });
});
