import { Ncm } from '../infra/typeorm/entities/Ncm';

export interface ListNcmsFilter {
  /** Busca por código (com ou sem pontos) ou descrição. */
  search?: string;
  /** Quando true, devolve só os NCMs leaf de 8 dígitos usáveis em NF-e. */
  apenasValidosNfe?: boolean;
  /** Filtra por nível hierárquico exato (2/4/5/6/7/8). */
  nivel?: number;
  limit?: number;
  offset?: number;
}

export interface INcmRepository {
  /** Lookup direto pelo código canônico (sem pontos). */
  findByCodigo(codigoSemPontos: string): Promise<Ncm | null>;
  list(filter?: ListNcmsFilter): Promise<{ items: Ncm[]; total: number }>;
}
