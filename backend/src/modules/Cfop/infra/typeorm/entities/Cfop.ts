import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@shared/infra/typeorm/BaseEntity';

import { CfopEscopo, CfopTipoOperacao } from '../../../domain/cfop-enums';

/**
 * Catálogo de CFOPs (Códigos Fiscais de Operações e Prestações) — Ajuste Sinief s/n
 * de 1970 + alterações. Tabela GLOBAL (sem `companyId`) compartilhada entre tenants.
 *
 * O sistema usa o catálogo para:
 *  - Validar o CFOP digitado em itens de NF-e (rejeita códigos desconhecidos).
 *  - Sugerir CFOPs aplicáveis durante a composição (filtragem por tipo/escopo).
 *  - Identificar operações que geram crédito de PIS/COFINS (flag específica).
 */
@Entity('cfops')
@Index('uq_cfops_codigo', ['codigo'], { unique: true })
@Index('idx_cfops_tipo_escopo', ['tipoOperacao', 'escopo'])
export class Cfop extends BaseEntity {
  @Column({ type: 'char', length: 4 })
  codigo!: string;

  @Column({ type: 'varchar', length: 500 })
  descricao!: string;

  @Column({ name: 'tipo_operacao', type: 'enum', enum: CfopTipoOperacao })
  tipoOperacao!: CfopTipoOperacao;

  @Column({ type: 'enum', enum: CfopEscopo })
  escopo!: CfopEscopo;

  /** Agrupamento descritivo (ex.: "Aquisição de Bens para Revenda"). Opcional. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  grupo?: string | null;

  /**
   * Indica se a operação gera crédito de PIS/COFINS no regime não-cumulativo
   * (Lei 10.637/2002 e 10.833/2003). Lista de referência: arquivo
   * "Tabela_CFOPOperacoesGeradorasCreditos.xls" da Receita Federal.
   */
  @Column({ name: 'gera_credito_pis_cofins', type: 'boolean', default: false })
  geraCreditoPisCofins!: boolean;

  /** False = código revogado ou em desuso. Mantemos no banco para histórico. */
  @Column({ type: 'boolean', default: true })
  ativo!: boolean;

  /** Observações operacionais (rejeições comuns, dicas de uso). */
  @Column({ type: 'text', nullable: true })
  observacoes?: string | null;
}
