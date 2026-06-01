import {
  AmbienteSefaz,
  CodigoRegimeTributario,
} from '@modules/Companies/infra/typeorm/entities/Company';
import {
  CstIbsCbs,
  IndicadorIE,
  IndicadorIntermediador,
  IndicadorPresenca,
} from '@shared/types/fiscal-enums';

import { FinalidadeNFe, FormaEmissao, TipoOperacao } from './nfe-enums';

/**
 * Modelo de entrada do NFeXmlBuilder. Não tem nada de TypeORM — é um DTO puro do domínio,
 * preenchido pelo use case `EmitirNFe` (Fase EP-07) a partir de:
 *  - Company (emitente)
 *  - Customer (destinatário)
 *  - itens da operação
 *  - resultado do MotorTributario (valores calculados de cada tributo)
 *
 * Não cobrimos TODOS os campos do MOC nesta versão — apenas os obrigatórios para uma
 * NF-e simples + os campos novos da Reforma (IBS/CBS/IS). Campos avançados como
 * `cana`, `agropecuário`, `combustível`, transporte modal, autorizado a download e
 * exportação ficam para iterações dedicadas conforme cliente fiscal precisar.
 */

export interface NFeIdentificacao {
  numero: number;
  serie: number;
  modelo: '55';
  naturezaOperacao: string;
  tipoOperacao: TipoOperacao;
  finalidade: FinalidadeNFe;
  formaEmissao: FormaEmissao;
  ambiente: AmbienteSefaz;
  /** Data/hora de emissão com fuso (tag dhEmi). */
  dhEmissao: Date;
  /** Data/hora de saída (saída/entrada de mercadorias) — opcional para serviços. */
  dhSaiEnt?: Date;
  /** Indicador de presença do comprador (indPres). */
  indicadorPresenca?: IndicadorPresenca;
  /**
   * Indicador de intermediador (indIntermed) — NT 2020.006. Obrigatório quando
   * `indicadorPresenca ∈ {INTERNET, TELEATENDIMENTO, ENTREGA_EM_DOMICILIO,
   * PRESENCIAL_FORA_ESTABELECIMENTO, OUTROS}`. Sem ele a SEFAZ rejeita cStat 434.
   */
  indicadorIntermediador?: IndicadorIntermediador;
  /** Código numérico aleatório (cNF) — 8 dígitos. */
  codigoNumerico: string;
  /** Indica se a operação é interestadual (preenche idDest). */
  idDest: 1 | 2 | 3; // 1=interna, 2=interestadual, 3=exterior

  /**
   * Grupo NFref — documentos fiscais referenciados. OBRIGATÓRIO para finalidade
   * DEVOLUCAO/COMPLEMENTAR/AJUSTE (a SEFAZ rejeita o XML com cStat 526 quando
   * finNFe ∈ {2,3,4} e não há referência). Aceita múltiplas referências, mas o caso
   * usual é uma só.
   */
  nfeReferenciadas?: NFeReferencia[];
}

/**
 * Referência a documento fiscal anterior (grupo NFref do XML). Suporta os 5 tipos
 * previstos no MOC: refNFe (chave 44 dígitos), refNF (modelo 1/1A — emitidas antes
 * de 2008), refCTe, refECF, refNFP (Produtor Rural).
 *
 * Nesta versão expomos apenas `refNFe` no contrato externo (caso mais comum, ~99%
 * das devoluções). Os outros tipos ficam disponíveis no domínio para extensão futura
 * sem mudança de schema do banco.
 */
export type NFeReferencia =
  | { tipo: 'NFE'; chaveAcesso: string }
  | {
      tipo: 'NF';
      cUf: string; // código IBGE da UF emitente (2 dígitos)
      anoMes: string; // AAMM
      cnpj: string; // 14 dígitos
      modelo: string; // 01 ou 1A
      serie: number;
      numero: number;
    }
  | { tipo: 'CTE'; chaveAcesso: string }
  | {
      tipo: 'NFP';
      cUf: string;
      anoMes: string;
      cnpjOuCpf: { kind: 'CNPJ' | 'CPF'; valor: string };
      ie: string; // ISENTO ou número
      modelo: string; // 01, 04 ou 1B
      serie: number;
      numero: number;
    };

export interface NFeEmitente {
  cnpj: string; // só dígitos
  razaoSocial: string;
  nomeFantasia?: string | null;
  ie?: string | null;
  im?: string | null;
  cnae?: string | null;
  crt: CodigoRegimeTributario;
  endereco: NFeEndereco;
}

export interface NFeEndereco {
  logradouro: string;
  numero: string;
  complemento?: string | null;
  bairro: string;
  codigoMunicipioIbge: string;
  municipio: string;
  uf: string;
  cep: string;
  codigoPais?: string;
  pais?: string;
  telefone?: string | null;
}

export interface NFeDestinatario {
  tipoPessoa: 'PF' | 'PJ' | 'ESTRANGEIRO';
  cnpjCpf: string;
  nome: string;
  ie?: string | null;
  indicadorIE: IndicadorIE;
  email?: string | null;
  suframa?: string | null;
  consumidorFinal: boolean;
  endereco: NFeEndereco;
}

/**
 * Item da NF-e. Carrega TODOS os tributos calculados (já vindos do MotorTributario).
 * Cada bloco (ICMS, ICMS-ST, FCP, DIFAL, IPI, PIS, COFINS, IBS, CBS, IS) é opcional —
 * o builder só emite o grupo quando os campos relevantes vêm preenchidos.
 */
export interface NFeItem {
  numero: number;
  codigo: string;
  ean?: string | null;
  descricao: string;
  ncm: string;
  cest?: string | null;
  cfop: string;
  unidadeComercial: string;
  quantidadeComercial: string;
  valorUnitario: string;
  valorTotal: string;
  unidadeTributavel: string;
  quantidadeTributavel: string;
  valorUnitarioTrib: string;
  /** Origem da mercadoria (0..8). */
  origem: number;

  valorFrete?: string;
  valorSeguro?: string;
  valorDesconto?: string;
  valorOutros?: string;

  // --- ICMS próprio ---
  cstIcms?: string;
  csosnIcms?: string;
  modBC?: number;
  baseIcms?: string;
  pRedBC?: string;
  aliqIcms?: string;
  valorIcms?: string;
  motDesICMS?: number;
  valorIcmsDeson?: string;
  /** Código de benefício fiscal (cBenef) aplicado. */
  cBenef?: string;

  // --- ICMS-ST ---
  cstIcmsSt?: string;
  modBCST?: number;
  pMVAST?: string;
  baseIcmsST?: string;
  aliqIcmsST?: string;
  valorIcmsST?: string;

  // --- FCP próprio ---
  baseFCP?: string;
  pFCP?: string;
  valorFCP?: string;

  // --- DIFAL ---
  baseICMSUFDest?: string;
  pICMSUFDest?: string;
  pICMSInter?: string;
  valorICMSUFDest?: string;
  valorICMSUFRemet?: string;
  baseFCPUFDest?: string;
  pFCPUFDest?: string;
  valorFCPUFDest?: string;

  // --- IPI ---
  cstIpi?: string;
  cEnq?: string;
  baseIpi?: string;
  aliqIpi?: string;
  valorIpi?: string;

  // --- PIS / COFINS ---
  cstPis?: string;
  basePis?: string;
  aliqPis?: string;
  valorPis?: string;
  cstCofins?: string;
  baseCofins?: string;
  aliqCofins?: string;
  valorCofins?: string;

  // --- IBS / CBS / IS (Reforma RT 2025.002) ---
  cstIbsCbs?: CstIbsCbs;
  cClassTrib?: string;
  baseIbsCbs?: string;
  aliqIbs?: string;
  valorIbs?: string;
  aliqCbs?: string;
  valorCbs?: string;
  cstIs?: string;
  aliqIs?: string;
  valorIs?: string;

  infAdProd?: string;
}

/**
 * Totais consolidados do documento. O MotorTributario já agrega os valores; o caller
 * só passa a estrutura pronta. O builder confere a soma para detectar inconsistências
 * antes de enviar à SEFAZ (cStat 533 ⇒ "valor total da nota fiscal divergente").
 */
export interface NFeTotais {
  valorProdutos: string;
  valorDesconto: string;
  valorFrete: string;
  valorSeguro: string;
  valorOutros: string;
  valorTotal: string;
  baseIcms: string;
  valorIcms: string;
  valorIcmsDeson: string;
  baseIcmsST: string;
  valorIcmsST: string;
  valorFCP: string;
  valorFCPST: string;
  valorFCPSTRet: string;
  valorICMSUFDest: string;
  valorICMSUFRemet: string;
  valorFCPUFDest: string;
  valorIpi: string;
  valorPis: string;
  valorCofins: string;
  valorII: string;
  valorTotTrib: string;
  // Totais Reforma
  baseIbsCbs: string;
  valorIbs: string;
  valorCbs: string;
  valorIs: string;
}

/**
 * Bloco `<transp>` da NF-e. `modFrete` é obrigatório; transportadora, veículo e volumes
 * são opcionais. Códigos modFrete:
 *   0 = Contratação por conta do remetente (CIF)
 *   1 = Contratação por conta do destinatário (FOB)
 *   2 = Contratação por conta de terceiros
 *   3 = Transporte próprio por conta do remetente
 *   4 = Transporte próprio por conta do destinatário
 *   9 = Sem ocorrência de transporte
 */
export interface NFeTransporte {
  modalidadeFrete: 0 | 1 | 2 | 3 | 4 | 9;
  transportadora?: NFeTransportadora;
  veiculo?: NFeVeiculo;
  volumes?: NFeVolume[];
}

export interface NFeTransportadora {
  /** PJ → CNPJ (14 dígitos). PF → CPF (11 dígitos). */
  cnpjCpf?: string | null;
  /** Razão social ou nome. */
  nome?: string | null;
  /** Inscrição estadual da transportadora. */
  ie?: string | null;
  /** Endereço completo (logradouro + número + bairro). */
  endereco?: string | null;
  municipio?: string | null;
  uf?: string | null;
}

export interface NFeVeiculo {
  /** Placa (Mercosul ABC1D23 ou antiga ABC1234). */
  placa: string;
  uf: string;
  /** Registro Nacional de Transportador de Carga (opcional). */
  rntc?: string | null;
}

export interface NFeVolume {
  quantidade?: number;
  especie?: string | null;
  marca?: string | null;
  numeracao?: string | null;
  pesoLiquido?: string | null;
  pesoBruto?: string | null;
}

export interface NFePagamento {
  meio: string; // tPag — 01..99
  valor: string;
  bandeira?: string;
}

export interface NFeDocument {
  chaveAcesso: string;
  identificacao: NFeIdentificacao;
  emitente: NFeEmitente;
  destinatario: NFeDestinatario;
  itens: NFeItem[];
  totais: NFeTotais;
  transporte: NFeTransporte;
  pagamentos: NFePagamento[];
  /** Texto livre que vai em infAdic/infCpl. */
  informacoesAdicionais?: string;
  /** Texto técnico que vai em infAdic/infAdFisco (apenas para fisco). */
  informacoesFisco?: string;
}
