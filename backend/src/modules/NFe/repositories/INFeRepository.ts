import { NFe } from '../infra/typeorm/entities/NFe';
import { NFeItem } from '../infra/typeorm/entities/NFeItem';
import { NFePagamento } from '../infra/typeorm/entities/NFePagamento';

export interface CreateNFeData
  extends Partial<NFe> {
  companyId: string;
  idempotencyKey: string;
  serie: number;
  numero: string;
  dhEmissao: Date;
  naturezaOperacao: string;
}

export interface CreateNFeItemData extends Partial<NFeItem> {
  numeroItem: number;
  codigo: string;
  descricao: string;
  ncm: string;
  cfop: string;
  unidadeComercial: string;
  quantidadeComercial: string;
  valorUnitario: string;
  valorTotal: string;
}

export interface CreateNFePagamentoData extends Partial<NFePagamento> {
  meio: string;
  valor: string;
}

export interface ListNFesFilter {
  companyId: string;
  status?: string;
  customerId?: string;
  from?: Date;
  to?: Date;
  search?: string;
  limit?: number;
  offset?: number;
}

/** Linha enxuta para exportação de XML em lote (não carrega o agregado inteiro). */
export interface NFeXmlExportRow {
  chaveAcesso: string;
  numero: string;
  serie: number;
  status: string;
  xml: string;
}

export interface INFeRepository {
  findByIdempotencyKey(key: string): Promise<NFe | null>;
  findById(companyId: string, id: string): Promise<NFe | null>;
  /**
   * Busca cross-tenant — usado APENAS pelo worker de reconciliação, que opera fora de
   * contexto de empresa. Não expor via HTTP.
   */
  findByIdAny(id: string): Promise<NFe | null>;
  findByIdWithRelations(companyId: string, id: string): Promise<NFe | null>;
  /**
   * Lista NFe em status PROCESSING há ao menos `minIdleMinutes` minutos — entrada para
   * o worker de reconciliação. Retorna até `limit` linhas, ordenadas pela mais antiga.
   */
  listStaleProcessing(minIdleMinutes: number, limit: number): Promise<NFe[]>;
  /**
   * Cria NFe + items + pagamentos em uma única transação. Retorna a NFe persistida com
   * id atribuído. Não chama SEFAZ — só persiste o agregado.
   */
  createAggregate(
    nfe: CreateNFeData,
    items: CreateNFeItemData[],
    pagamentos: CreateNFePagamentoData[],
  ): Promise<NFe>;
  update(id: string, patch: Partial<NFe>): Promise<NFe>;
  list(filter: ListNFesFilter): Promise<{ items: NFe[]; total: number }>;
  /**
   * Lista, para exportação em lote, as NF-e com XML disponível emitidas na competência
   * (ano/mês). O mês é avaliado no horário de Brasília (America/Sao_Paulo) para bater com
   * a data que aparece na nota — não em UTC. Só notas com chave e XML (AUTHORIZED/CANCELLED).
   */
  listXmlByPeriodo(companyId: string, ano: number, mes: number): Promise<NFeXmlExportRow[]>;
  /** Localiza NFe pelo escopo (companyId+modelo+serie+numero) — usado pra detectar
   * reuso de numero quando a anterior nao chegou a virar NFe valida. */
  findByScope(
    companyId: string,
    modelo: string,
    serie: number,
    numero: string,
  ): Promise<NFe | null>;
  /** Hard delete (com cascata em items/pagamentos/eventos). Use APENAS para
   * descartar NFe que nao chegou a SEFAZ (REJECTED/PENDING/DRAFT). */
  hardDelete(id: string): Promise<void>;
}
