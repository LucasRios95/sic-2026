import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@shared/infra/typeorm/BaseEntity';

/**
 * Nomenclatura Comum do Mercosul (NCM) — catálogo oficial publicado pela CAMEX.
 *
 * A tabela cobre TODA a hierarquia (capítulos 2 dígitos → posições 4 → sub-posições 5/6
 * → itens 7 → sub-itens 9 → NCM 8 dígitos leaf). Pra NF-e, apenas códigos com
 * `validoParaNfe = true` (codigoSemPontos com 8 dígitos) podem ser usados em `prod.NCM`.
 *
 * `codigoSemPontos` é o formato canônico (apenas dígitos, sem separadores). Usado em
 * todas as buscas porque é o que vai no XML da NF-e. `codigo` mantém o formato original
 * da CAMEX (com pontos: "0101.21.00") para exibição.
 */
@Entity('ncms')
@Index('uq_ncms_codigo_sem_pontos', ['codigoSemPontos'], { unique: true })
@Index('idx_ncms_valido_nfe', ['validoParaNfe', 'ativo'])
@Index('idx_ncms_nivel', ['nivel'])
export class Ncm extends BaseEntity {
  /** Código com separadores oficiais da CAMEX. Ex.: "01.01", "0101.21.00". */
  @Column({ type: 'varchar', length: 12 })
  codigo!: string;

  /** Código apenas com dígitos. Ex.: "01", "0101", "01012100". Usado no XML NF-e. */
  @Column({ name: 'codigo_sem_pontos', type: 'varchar', length: 8 })
  codigoSemPontos!: string;

  @Column({ type: 'varchar', length: 500 })
  descricao!: string;

  /**
   * Nível hierárquico baseado no comprimento do codigoSemPontos:
   *   2  → Capítulo (01)
   *   4  → Posição (0101)
   *   5  → Sub-posição simples (01012)
   *   6  → Sub-posição composta (010121)
   *   7  → Item (0101211)
   *   8  → NCM completo (01012100) — único nível usado em NF-e
   */
  @Column({ type: 'smallint' })
  nivel!: number;

  /**
   * True quando codigoSemPontos tem exatamente 8 dígitos. Filtro principal pra
   * autocomplete de produtos (faturista só vê NCMs válidos).
   */
  @Column({ name: 'valido_para_nfe', type: 'boolean', default: false })
  validoParaNfe!: boolean;

  /** Data inicial de vigência publicada pela CAMEX. */
  @Column({ name: 'data_inicio', type: 'date', nullable: true })
  dataInicio?: string | null;

  /** Data final de vigência (CAMEX usa 31/12/9999 para "em vigor"). */
  @Column({ name: 'data_fim', type: 'date', nullable: true })
  dataFim?: string | null;

  /** Ato normativo de origem (ex.: "Res Camex 272/2021"). */
  @Column({ type: 'varchar', length: 100, nullable: true })
  ato?: string | null;

  /** False quando o NCM foi revogado. Mantemos no banco para histórico. */
  @Column({ type: 'boolean', default: true })
  ativo!: boolean;
}
