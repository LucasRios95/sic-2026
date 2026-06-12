import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { NFeSchemaValidator } from '@modules/NFe/infra/validation/NFeSchemaValidator';

// Fixtures resolvidos a partir do cwd (raiz do backend / `/app` no container).
const FIX = (name: string) => readFileSync(resolve('tests/fixtures/nfe', name), 'utf-8');
const XML_VALIDO = FIX('nfe-valida.xml');
const XML_INVALIDO = FIX('nfe-rejeitada-cnae-xlgr-modbc.xml');

describe('NFeSchemaValidator', () => {
  const validator = new NFeSchemaValidator();

  it('não retorna erros para um XML válido contra o XSD oficial', () => {
    expect(validator.validate(XML_VALIDO)).toEqual([]);
  });

  it('detecta os erros estruturais reais da nota rejeitada (CNAE, xLgr, modBC)', () => {
    const errors = validator.validate(XML_INVALIDO);
    expect(errors.length).toBeGreaterThan(0);
    const todas = errors.map((e) => e.message).join('\n');
    expect(todas).toContain('CNAE'); // CNAE sem IM antes
    expect(todas).toContain('xLgr'); // espaço no fim do logradouro (facet pattern)
    expect(todas).toContain('modBC'); // ICMS00 sem modBC obrigatório
    // Cada erro traz uma mensagem não vazia para o diagnóstico.
    expect(errors.every((e) => typeof e.message === 'string' && e.message.length > 0)).toBe(true);
  });

  it('formatErrors resume os erros para o x_motivo', () => {
    const errors = validator.validate(XML_INVALIDO);
    const resumo = validator.formatErrors(errors);
    expect(resumo).toContain('CNAE');
    expect(resumo).toContain(' | '); // múltiplos erros separados
  });

  it('trata XML malformado como erro (não lança)', () => {
    const errors = validator.validate('<NFe><infNFe></NFe>');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('modo "off" não valida (retorna vazio mesmo para XML inválido)', () => {
    const off = new NFeSchemaValidator();
    (off as unknown as { mode: string }).mode = 'off';
    expect(off.validate(XML_INVALIDO)).toEqual([]);
  });
});
