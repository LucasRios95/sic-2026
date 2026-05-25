import { CodigoRegimeTributario } from '@modules/Companies/infra/typeorm/entities/Company';
import { ProductTaxRule } from '@modules/Products/infra/typeorm/entities/ProductTaxRule';
import { IndicadorIE } from '@shared/types/fiscal-enums';

/**
 * Flags de habilitação tributária da empresa emitente (espelham Company.usaIcms* da PRD 6.1.1.1).
 * Determinam quais calculadoras o pipeline aplica.
 */
export interface EmpresaContexto {
  companyId: string;
  crt: CodigoRegimeTributario;
  uf: string;
  flags: {
    usaIcms: boolean;
    usaIcmsSt: boolean;
    usaIpi: boolean;
    usaDifal: boolean;
    usaFcp: boolean;
    usaIcmsDesonerado: boolean;
  };
}

/**
 * Atributos fiscais do destinatário relevantes para o cálculo. PRD 6.1.1.2.
 */
export interface DestinatarioContexto {
  uf: string;
  consumidorFinal: boolean;
  indicadorIE: IndicadorIE;
  crt?: CodigoRegimeTributario | null;
  suframa?: string | null;
  /** "1058" = Brasil (default). Diferentes valores indicam exportação. */
  codigoPais?: string;
}

/**
 * Item da operação. O caller já resolveu a regra tributária vigente (`taxRule`) consultando
 * o ProductTaxRuleRepository pela data da operação — o motor não busca isso de novo.
 */
export interface ItemContexto {
  /** Identificador opaco para correlacionar resultado ao item de entrada. */
  itemId: string;
  productId?: string;
  ncm: string;
  cest?: string | null;
  origem: number;
  quantidade: string;
  valorUnitario: string;
  valorOutros?: string;
  valorFrete?: string;
  valorSeguro?: string;
  valorDesconto?: string;
  cfop: string;
  /** Regra tributária vigente do produto na data da operação. */
  taxRule: ProductTaxRule;
}

/**
 * Contexto completo da operação. `dataOperacao` decide qual vigência de parâmetros e
 * alíquotas é aplicada (suporta "ano-teste 2026" vs. "vigência plena 2027+").
 */
export interface ContextoCalculo {
  dataOperacao: Date;
  empresa: EmpresaContexto;
  destinatario: DestinatarioContexto;
  itens: ItemContexto[];
}
