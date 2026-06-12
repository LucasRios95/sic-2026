import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseXml, type Document } from 'libxmljs2';

import { env } from '@config/env';
import { logger } from '@shared/logger';

export interface SchemaError {
  message: string;
  /** Linha do XML (libxml2 serializa em 1 linha, então costuma ser 1). */
  line: number | null;
  column: number;
}

export type XsdValidationMode = 'block' | 'warn' | 'off';

/**
 * Caminho padrão (relativo ao cwd) do XSD de entrada já vendorizado dentro do backend.
 * Em runtime o cwd é `/app` (container) ou a raiz do backend (dev/tsx). O pacote PL_010c
 * já contém os grupos da Reforma (IBSCBS/cClassTrib), então valida NF-e RTC.
 */
const DEFAULT_MAIN_XSD = 'schemas/nfe/PL_010c_NT2022_002v1.30/nfe_v4.00.xsd';

/**
 * Valida o XML da NF-e contra o XSD oficial ANTES de assinar/transmitir. Sem isto, qualquer
 * divergência estrutural só seria detectada pela SEFAZ como `cStat 225` ("Falha no Schema
 * XML"), genérico e sem apontar o campo. Aqui o erro vem com elemento + linha.
 *
 * Implementação: `libxmljs2` (bindings libxml2). O XSD principal importa outros 4 arquivos
 * (`leiauteNFe`, `tiposBasico`, `DFeTiposBasicos`, `xmldsig`); passamos `baseUrl` = caminho
 * absoluto do XSD principal para que o libxml2 resolva esses `import`/`include` relativos.
 *
 * O schema compilado é caro de montar, então é cacheado na 1ª validação (lazy). O serviço é
 * registrado como singleton no container, então o cache vive pelo processo.
 *
 * Modo controlado por `NFE_XSD_VALIDATION` (block|warn|off) — ver `EmitirNFeUseCase` para o
 * efeito de cada modo no fluxo de emissão.
 */
export class NFeSchemaValidator {
  private schemaDoc: Document | null = null;
  private readonly mainXsdPath: string;
  readonly mode: XsdValidationMode;

  constructor() {
    this.mainXsdPath = resolve(env.NFE_SCHEMA_PATH || DEFAULT_MAIN_XSD);
    this.mode = env.NFE_XSD_VALIDATION;
  }

  /** Compila (e cacheia) o XSD. baseUrl no caminho do XSD principal resolve os imports. */
  private getSchema(): Document {
    if (!this.schemaDoc) {
      const content = readFileSync(this.mainXsdPath, 'utf-8');
      this.schemaDoc = parseXml(content, { baseUrl: this.mainXsdPath });
    }
    return this.schemaDoc;
  }

  /**
   * Valida o XML. Retorna `[]` quando válido (ou quando o modo é `off`). Caso contrário,
   * a lista de erros de schema. NÃO lança — o caller decide o que fazer conforme o modo.
   */
  validate(xml: string): SchemaError[] {
    if (this.mode === 'off') return [];

    let xmlDoc: Document;
    try {
      xmlDoc = parseXml(xml);
    } catch (err) {
      return [{ message: `XML malformado: ${(err as Error).message}`, line: null, column: 0 }];
    }

    let valid: boolean;
    try {
      valid = xmlDoc.validate(this.getSchema());
    } catch (err) {
      // Falha ao compilar o XSD (arquivo ausente/corrompido) não deve derrubar a emissão:
      // loga e trata como "sem erros de schema" para não bloquear por problema de infra.
      logger.error(
        { err, mainXsdPath: this.mainXsdPath },
        'Falha ao carregar XSD da NF-e — validação local ignorada nesta emissão',
      );
      return [];
    }

    if (valid) return [];
    return xmlDoc.validationErrors.map((e) => ({
      message: String(e.message).trim(),
      line: e.line,
      column: e.column,
    }));
  }

  /** Resumo curto dos erros para log e para a coluna `x_motivo` (varchar 300). */
  formatErrors(errors: SchemaError[]): string {
    return errors.map((e) => (e.line ? `L${e.line}: ${e.message}` : e.message)).join(' | ');
  }
}
