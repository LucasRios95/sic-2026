import { NsuCursor } from '../infra/typeorm/entities/NsuCursor';

export interface INsuCursorRepository {
  /** Carrega (ou cria com cursor=0) o cursor para o par (empresa, origem). */
  findOrCreate(companyId: string, origem: string): Promise<NsuCursor>;

  /** Avança o cursor após processar um lote. */
  advance(
    id: string,
    newValue: string,
    lastCStat: string | null,
  ): Promise<void>;
}
