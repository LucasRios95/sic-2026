import { describe, expect, it } from 'vitest';

import { CodigoRegimeTributario } from '@modules/Companies/infra/typeorm/entities/Company';
import { appendInfoTributariaToInfCpl } from '@modules/NFe/useCases/EmitirNFe/EmitirNFeUseCase';

function calculo(
  totais: Partial<{
    valorTotal: string;
    valorCredSN: string;
    valorTotTrib: string;
    valorTotTribFederal: string;
    valorTotTribEstadual: string;
  }>,
  itens: Array<{ pCredSN?: string; valorCredSN?: string }> = [],
) {
  return {
    itens,
    totais: {
      valorTotal: '100.00',
      valorCredSN: '0.00',
      valorTotTrib: '0.00',
      valorTotTribFederal: '0.00',
      valorTotTribEstadual: '0.00',
      ...totais,
    },
  };
}

describe('appendInfoTributariaToInfCpl', () => {
  it('anexa o texto do crédito do Simples (art. 23 da LC 123)', () => {
    const r = appendInfoTributariaToInfCpl(
      'Pedido 123',
      calculo({ valorCredSN: '2.56' }, [{ pCredSN: '2.5600', valorCredSN: '2.56' }]),
      CodigoRegimeTributario.SIMPLES_NACIONAL,
    );
    expect(r).toBe(
      'Pedido 123 | PERMITE O APROVEITAMENTO DO CRÉDITO DE ICMS NO VALOR DE R$ 2,56; ' +
        'CORRESPONDENTE À ALÍQUOTA DE 2,56%, NOS TERMOS DO ART. 23 DA LEI COMPLEMENTAR Nº 123, DE 2006',
    );
  });

  it('anexa o valor aproximado dos tributos com divisão por ente no Regime Normal', () => {
    const r = appendInfoTributariaToInfCpl(
      undefined,
      calculo({ valorTotTrib: '25.58', valorTotTribFederal: '7.58', valorTotTribEstadual: '18.00' }),
      CodigoRegimeTributario.REGIME_NORMAL,
    );
    expect(r).toBe(
      'Valor aproximado dos tributos: R$ 25,58 (25,58%) — Federais R$ 7,58; Estaduais R$ 18,00. ' +
        'Fonte: cálculo próprio (Lei 12.741/2012)',
    );
  });

  it('não duplica o texto quando já está no infCpl (prévia → emissão)', () => {
    const c = calculo({ valorTotTrib: '6.00' });
    const primeira = appendInfoTributariaToInfCpl(undefined, c, CodigoRegimeTributario.SIMPLES_NACIONAL);
    const segunda = appendInfoTributariaToInfCpl(primeira, c, CodigoRegimeTributario.SIMPLES_NACIONAL);
    expect(segunda).toBe(primeira);
  });

  it('sem crédito nem tributos aproximados mantém o infCpl', () => {
    expect(
      appendInfoTributariaToInfCpl('obs', calculo({}), CodigoRegimeTributario.REGIME_NORMAL),
    ).toBe('obs');
  });
});
