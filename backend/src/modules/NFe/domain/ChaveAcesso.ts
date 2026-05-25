import { UF_CODIGO } from './nfe-enums';

/**
 * Chave de Acesso da NF-e — 44 dígitos compostos por:
 *   posição  campo          tamanho
 *   01-02    cUF            2     (código IBGE da UF do emitente)
 *   03-06    AAMM           4     (ano + mês de emissão)
 *   07-20    CNPJ emit      14
 *   21-22    mod            2     (55 = NF-e, 65 = NFC-e)
 *   23-25    série          3     (com zeros à esquerda)
 *   26-34    nNF            9     (com zeros à esquerda)
 *   35       tpEmis         1
 *   36-43    cNF            8     (código numérico aleatório)
 *   44       cDV            1     (dígito verificador — módulo 11)
 *
 * Fonte: MOC NF-e 7.00, item 3.6.
 *
 * O `cNF` (código numérico aleatório de 8 dígitos) é usado pela SEFAZ para evitar que
 * dois XMLs com o mesmo número de NF-e e mesma série produzam chaves idênticas — por
 * isso é gerado aleatório no momento da emissão e persistido para reuso em retentativas.
 */
export class ChaveAcesso {
  private constructor(public readonly value: string) {}

  static build(input: {
    ufEmitente: string;
    anoEmissao: number;
    mesEmissao: number;
    cnpjEmitente: string;
    modelo: '55' | '65';
    serie: number;
    numero: number;
    tipoEmissao: number; // 1..9
    codigoNumerico: string; // 8 dígitos
  }): ChaveAcesso {
    const cUF = UF_CODIGO[input.ufEmitente];
    if (!cUF) throw new Error(`UF ${input.ufEmitente} sem código IBGE conhecido`);

    const aamm = `${String(input.anoEmissao).slice(-2)}${pad(input.mesEmissao, 2)}`;
    const cnpj = onlyDigits(input.cnpjEmitente);
    if (cnpj.length !== 14) throw new Error('CNPJ deve ter 14 dígitos');
    if (!/^\d{8}$/.test(input.codigoNumerico)) {
      throw new Error('codigoNumerico deve ter exatamente 8 dígitos');
    }

    const base =
      cUF +
      aamm +
      cnpj +
      input.modelo +
      pad(input.serie, 3) +
      pad(input.numero, 9) +
      String(input.tipoEmissao) +
      input.codigoNumerico;
    if (base.length !== 43) {
      throw new Error(`Base da chave deve ter 43 dígitos, recebeu ${base.length}`);
    }
    const dv = mod11Dv(base);
    return new ChaveAcesso(base + dv);
  }

  /**
   * Calcula o dígito verificador de uma chave existente (44 dígitos), útil para
   * validar uma chave recebida de fora (XML de NF-e de entrada).
   */
  static validate(value: string): boolean {
    const raw = onlyDigits(value);
    if (raw.length !== 44) return false;
    const expected = mod11Dv(raw.slice(0, 43));
    return expected === raw.slice(43);
  }

  /** Gera um cNF aleatório (8 dígitos) — usar no momento da emissão. */
  static generateCodigoNumerico(): string {
    const min = 10_000_000;
    const max = 99_999_999;
    return String(Math.floor(min + Math.random() * (max - min + 1)));
  }
}

function pad(n: number, len: number): string {
  return String(n).padStart(len, '0');
}

function onlyDigits(v: string): string {
  return v.replace(/\D/g, '');
}

/**
 * Cálculo do DV da chave de acesso (módulo 11 com pesos 2..9 cíclicos da direita
 * para a esquerda). DV 0 quando o resto é 0 ou 1.
 */
function mod11Dv(base: string): string {
  let sum = 0;
  let weight = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    sum += Number(base[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const rest = sum % 11;
  const dv = rest === 0 || rest === 1 ? 0 : 11 - rest;
  return String(dv);
}
