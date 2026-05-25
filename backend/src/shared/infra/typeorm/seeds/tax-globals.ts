/**
 * Dados oficiais das tabelas globais fiscais — alimentação inicial 2026.
 *
 * Fontes:
 *  - Resolução do Senado 22/89: 7% para destinos Norte/Nordeste/Centro-Oeste/ES
 *    quando origem é Sul/Sudeste (exceto ES); 12% nas demais combinações interestaduais.
 *  - Resolução do Senado 13/2012: 4% para mercadorias importadas em qualquer operação
 *    interestadual.
 *  - Alíquotas internas: cada UF instituiu por lei estadual; valores vigentes em 2026.
 *  - FCP: cada UF decide se adota e com qual percentual (0% para UFs que não instituíram).
 *
 * Esses valores são SEMPRE atualizáveis pelo processo formal de monitoramento normativo,
 * sem precisar de deploy. Esta lista é apenas o estado-zero do sistema.
 */

export type Uf =
  | 'AC' | 'AL' | 'AM' | 'AP' | 'BA' | 'CE' | 'DF' | 'ES' | 'GO' | 'MA'
  | 'MG' | 'MS' | 'MT' | 'PA' | 'PB' | 'PE' | 'PI' | 'PR' | 'RJ' | 'RN'
  | 'RO' | 'RR' | 'RS' | 'SC' | 'SE' | 'SP' | 'TO';

export const TODAS_UFS: Uf[] = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB',
  'PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO',
];

/** UFs do Sul + Sudeste exceto ES (origens "ricas" no contexto da Resolução 22/89). */
const SUDESTE_SUL_EXC_ES: Uf[] = ['SP', 'RJ', 'MG', 'PR', 'SC', 'RS'];

/** Alíquota interestadual ICMS para mercadoria NACIONAL conforme Res. Senado 22/89. */
export function aliqInterestadualNacional(origem: Uf, destino: Uf): string {
  if (origem === destino) {
    throw new Error('Operação não é interestadual quando origem == destino');
  }
  // De Sul/Sudeste (exceto ES) para Norte/Nordeste/Centro-Oeste/ES: 7%.
  if (SUDESTE_SUL_EXC_ES.includes(origem) && !SUDESTE_SUL_EXC_ES.includes(destino)) {
    return '7.0000';
  }
  return '12.0000';
}

/** Alíquota interestadual para mercadoria IMPORTADA — Res. Senado 13/2012. */
export const ALIQ_INTERESTADUAL_IMPORTADO = '4.0000';

/**
 * Alíquotas internas vigentes em 2026. Valores aproximados de domínio público;
 * em produção, atualizar pela equipe fiscal a cada mudança de lei estadual.
 */
export const ALIQ_INTERNA_2026: Record<Uf, { aliqInterna: string; aliqFcp: string | null }> = {
  AC: { aliqInterna: '19.0000', aliqFcp: null },
  AL: { aliqInterna: '20.0000', aliqFcp: '2.0000' },
  AM: { aliqInterna: '20.0000', aliqFcp: null },
  AP: { aliqInterna: '18.0000', aliqFcp: null },
  BA: { aliqInterna: '20.5000', aliqFcp: '2.0000' },
  CE: { aliqInterna: '20.0000', aliqFcp: '2.0000' },
  DF: { aliqInterna: '20.0000', aliqFcp: null },
  ES: { aliqInterna: '17.0000', aliqFcp: '2.0000' },
  GO: { aliqInterna: '19.0000', aliqFcp: null },
  MA: { aliqInterna: '23.0000', aliqFcp: '2.0000' },
  MG: { aliqInterna: '18.0000', aliqFcp: '2.0000' },
  MS: { aliqInterna: '17.0000', aliqFcp: '2.0000' },
  MT: { aliqInterna: '17.0000', aliqFcp: '2.0000' },
  PA: { aliqInterna: '19.0000', aliqFcp: null },
  PB: { aliqInterna: '20.0000', aliqFcp: '2.0000' },
  PE: { aliqInterna: '20.5000', aliqFcp: '2.0000' },
  PI: { aliqInterna: '22.5000', aliqFcp: '2.0000' },
  PR: { aliqInterna: '19.5000', aliqFcp: '2.0000' },
  RJ: { aliqInterna: '22.0000', aliqFcp: '4.0000' },
  RN: { aliqInterna: '20.0000', aliqFcp: '2.0000' },
  RO: { aliqInterna: '19.5000', aliqFcp: '2.0000' },
  RR: { aliqInterna: '20.0000', aliqFcp: null },
  RS: { aliqInterna: '17.0000', aliqFcp: '2.0000' },
  SC: { aliqInterna: '17.0000', aliqFcp: null },
  SE: { aliqInterna: '19.0000', aliqFcp: '2.0000' },
  SP: { aliqInterna: '18.0000', aliqFcp: '2.0000' },
  TO: { aliqInterna: '20.0000', aliqFcp: '2.0000' },
};
