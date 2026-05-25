import { describe, expect, it } from 'vitest';

import { AmbienteSefaz } from '@modules/Companies/infra/typeorm/entities/Company';
import { SefazEndpoints } from '@modules/NFe/infra/sefaz/SefazEndpoints';

describe('SefazEndpoints', () => {
  it('SP usa autorizadora própria em homologação', () => {
    const r = SefazEndpoints.url('SP', AmbienteSefaz.HOMOLOGACAO, 'NFeStatusServico4');
    expect(r.autorizadora).toBe('SP');
    expect(r.contingenciaSvc).toBe(false);
    expect(r.url).toMatch(/^https:\/\/homologacao\.nfe\.fazenda\.sp\.gov\.br/);
    expect(r.url).toMatch(/NFeStatusServico4\.asmx$/);
  });

  it('AP roteia para SEFAZ-Virtual RS (SVRS)', () => {
    const r = SefazEndpoints.url('AP', AmbienteSefaz.PRODUCAO, 'NFeAutorizacao4');
    expect(r.autorizadora).toBe('SVRS');
    expect(r.url).toMatch(/svrs\.rs\.gov\.br/);
  });

  it('MA/PA roteiam para SVAN', () => {
    expect(
      SefazEndpoints.url('MA', AmbienteSefaz.HOMOLOGACAO, 'NFeAutorizacao4').autorizadora,
    ).toBe('SVAN');
    expect(
      SefazEndpoints.url('PA', AmbienteSefaz.PRODUCAO, 'NFeAutorizacao4').autorizadora,
    ).toBe('SVAN');
  });

  it('Distribuição DF-e usa ambiente nacional (SVRS)', () => {
    const r = SefazEndpoints.url('SP', AmbienteSefaz.PRODUCAO, 'NFeDistribuicaoDFe');
    expect(r.autorizadora).toBe('NACIONAL');
    expect(r.url).toMatch(/svrs\.rs\.gov\.br/);
  });

  it('contingência SVC-AN para SP/RJ/ES/MG/BA/GO/PR', () => {
    for (const uf of ['SP', 'RJ', 'ES', 'MG', 'BA', 'GO', 'PR']) {
      const r = SefazEndpoints.url(uf, AmbienteSefaz.HOMOLOGACAO, 'NFeAutorizacao4', {
        contingenciaSvc: true,
      });
      expect(r.autorizadora).toBe('SVC-AN');
      expect(r.contingenciaSvc).toBe(true);
    }
  });

  it('contingência SVC-RS para demais UFs', () => {
    for (const uf of ['RS', 'SC', 'CE', 'PE']) {
      const r = SefazEndpoints.url(uf, AmbienteSefaz.HOMOLOGACAO, 'NFeAutorizacao4', {
        contingenciaSvc: true,
      });
      expect(r.autorizadora).toBe('SVC-RS');
    }
  });
});
