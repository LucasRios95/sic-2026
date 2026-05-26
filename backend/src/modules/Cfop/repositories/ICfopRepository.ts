import { CfopEscopo, CfopTipoOperacao } from '../domain/cfop-enums';
import { Cfop } from '../infra/typeorm/entities/Cfop';

export interface ListCfopsFilter {
  search?: string;
  tipoOperacao?: CfopTipoOperacao;
  escopo?: CfopEscopo;
  apenasGeraCredito?: boolean;
  apenasAtivos?: boolean;
}

export interface UpsertCfopData {
  codigo: string;
  descricao: string;
  tipoOperacao: CfopTipoOperacao;
  escopo: CfopEscopo;
  grupo?: string | null;
  geraCreditoPisCofins?: boolean;
  ativo?: boolean;
  observacoes?: string | null;
}

export interface ICfopRepository {
  list(filter?: ListCfopsFilter): Promise<Cfop[]>;
  findByCodigo(codigo: string): Promise<Cfop | null>;
  upsert(data: UpsertCfopData): Promise<Cfop>;
}
