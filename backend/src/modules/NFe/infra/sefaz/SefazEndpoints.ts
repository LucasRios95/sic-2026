import { AmbienteSefaz } from '@modules/Companies/infra/typeorm/entities/Company';

/**
 * Roteamento de UFs para SEFAZ autorizadora. Algumas UFs não emitem própria — são
 * atendidas pela SEFAZ-Virtual (SVRS) ou pela SEFAZ-Virtual de outra UF.
 *
 * Fontes: Portal NF-e, item "Sites das SEFAZ". URLs base homologação/produção 4.00 NF-e.
 *
 * As URLs aqui são MAPA DE DOMÍNIOS conhecidos — a tabela completa de endpoints por
 * serviço (NFeAutorizacao4, NFeRetAutorizacao4, NfeStatusServico4, RecepcaoEvento4,
 * NFeInutilizacao4, NFeConsultaProtocolo4, NFeConsultaCadastro4) é montada via
 * `SefazEndpoints.url()` combinando esses domínios com o sufixo do serviço.
 *
 * IMPORTANTE: em produção, validar contra o "Lista de Web Services" do MOC vigente
 * — esta tabela é o estado atual conhecido e DEVE ser auditada antes do go-live.
 */

export type SefazService =
  | 'NFeAutorizacao4'
  | 'NFeRetAutorizacao4'
  | 'NFeStatusServico4'
  | 'NFeRecepcaoEvento4'
  | 'NFeInutilizacao4'
  | 'NFeConsultaProtocolo4'
  | 'NFeConsultaCadastro4'
  | 'NFeDistribuicaoDFe';

/**
 * UF → autorizadora real. UFs que não têm autorizadora própria apontam para `SVRS` ou
 * outra SEFAZ-Virtual. SVC (contingência) é tratada à parte.
 */
const UF_AUTORIZADORA: Record<string, string> = {
  AC: 'SVRS', AL: 'SVRS', AM: 'AM', AP: 'SVRS', BA: 'BA', CE: 'CE',
  DF: 'SVRS', ES: 'SVRS', GO: 'GO', MA: 'SVAN', MG: 'MG', MS: 'MS',
  MT: 'MT', PA: 'SVAN', PB: 'SVRS', PE: 'PE', PI: 'SVRS', PR: 'PR',
  RJ: 'SVRS', RN: 'SVRS', RO: 'SVRS', RR: 'SVRS', RS: 'RS', SC: 'SVRS',
  SE: 'SVRS', SP: 'SP', TO: 'SVRS',
};

/**
 * Domínios base por autorizadora + ambiente. O caminho específico do serviço varia por
 * autorizadora (alguns usam paths como /ws/NFeAutorizacao/NFeAutorizacao4.asmx).
 *
 * Esta versão registra apenas SP, RS, MG, BA, AM, SVRS, SVAN — cobertura inicial do
 * Plano EP-06 TSK-102. Adicionar outras UFs conforme demanda dos primeiros clientes.
 */
const ENDPOINT_BASE: Record<string, Record<AmbienteSefaz, string>> = {
  SP: {
    [AmbienteSefaz.HOMOLOGACAO]: 'https://homologacao.nfe.fazenda.sp.gov.br/ws',
    [AmbienteSefaz.PRODUCAO]: 'https://nfe.fazenda.sp.gov.br/ws',
  },
  RS: {
    [AmbienteSefaz.HOMOLOGACAO]: 'https://nfe-homologacao.sefazrs.rs.gov.br/ws',
    [AmbienteSefaz.PRODUCAO]: 'https://nfe.sefazrs.rs.gov.br/ws',
  },
  MG: {
    [AmbienteSefaz.HOMOLOGACAO]: 'https://hnfe.fazenda.mg.gov.br/nfe2/services',
    [AmbienteSefaz.PRODUCAO]: 'https://nfe.fazenda.mg.gov.br/nfe2/services',
  },
  BA: {
    [AmbienteSefaz.HOMOLOGACAO]: 'https://hnfe.sefaz.ba.gov.br/webservices',
    [AmbienteSefaz.PRODUCAO]: 'https://nfe.sefaz.ba.gov.br/webservices',
  },
  AM: {
    [AmbienteSefaz.HOMOLOGACAO]: 'https://homnfe.sefaz.am.gov.br/services2',
    [AmbienteSefaz.PRODUCAO]: 'https://nfe.sefaz.am.gov.br/services2',
  },
  // SEFAZ-Virtuais que atendem várias UFs.
  SVRS: {
    [AmbienteSefaz.HOMOLOGACAO]: 'https://nfe-homologacao.svrs.rs.gov.br/ws',
    [AmbienteSefaz.PRODUCAO]: 'https://nfe.svrs.rs.gov.br/ws',
  },
  SVAN: {
    [AmbienteSefaz.HOMOLOGACAO]: 'https://hom.svan.fazenda.gov.br/ws',
    [AmbienteSefaz.PRODUCAO]: 'https://www.svan.fazenda.gov.br/ws',
  },
};

/** SVC (contingência). SVC-AN para SP/CE etc; SVC-RS para PR/RJ etc. */
const SVC_AN_BASE = {
  [AmbienteSefaz.HOMOLOGACAO]: 'https://hom.svc.fazenda.gov.br/ws',
  [AmbienteSefaz.PRODUCAO]: 'https://www.svc.fazenda.gov.br/ws',
};
const SVC_RS_BASE = {
  [AmbienteSefaz.HOMOLOGACAO]: 'https://nfe-homologacao.svrs.rs.gov.br/ws',
  [AmbienteSefaz.PRODUCAO]: 'https://nfe.svrs.rs.gov.br/ws',
};

export interface EndpointResolution {
  url: string;
  autorizadora: string;
  contingenciaSvc: boolean;
}

export class SefazEndpoints {
  /**
   * Resolve a URL do web service para um par (UF emitente, ambiente, serviço).
   * Quando `contingenciaSvc` for true, roteia para SVC-AN ou SVC-RS conforme a UF
   * (definição oficial: SP, RJ, ES, MG, BA, GO, PR → SVC-AN; demais → SVC-RS — varia
   * por nota técnica, conferir antes de operar).
   */
  static url(
    uf: string,
    ambiente: AmbienteSefaz,
    service: SefazService,
    options: { contingenciaSvc?: boolean } = {},
  ): EndpointResolution {
    // Distribuição DF-e tem domínio próprio (ambiente nacional, não por UF).
    if (service === 'NFeDistribuicaoDFe') {
      const base = ENDPOINT_BASE.SVRS[ambiente];
      return {
        url: `${base}/${service}.asmx`,
        autorizadora: 'NACIONAL',
        contingenciaSvc: false,
      };
    }

    if (options.contingenciaSvc) {
      const svc = svcAnUfs.includes(uf) ? SVC_AN_BASE : SVC_RS_BASE;
      return {
        url: `${svc[ambiente]}/${service}.asmx`,
        autorizadora: svcAnUfs.includes(uf) ? 'SVC-AN' : 'SVC-RS',
        contingenciaSvc: true,
      };
    }

    const autorizadora = UF_AUTORIZADORA[uf];
    if (!autorizadora) throw new Error(`UF ${uf} sem autorizadora mapeada`);
    const base = ENDPOINT_BASE[autorizadora]?.[ambiente];
    if (!base) {
      throw new Error(`Endpoint para ${autorizadora}/${ambiente} não cadastrado`);
    }
    return {
      url: `${base}/${service}.asmx`,
      autorizadora,
      contingenciaSvc: false,
    };
  }
}

const svcAnUfs = ['SP', 'RJ', 'ES', 'MG', 'BA', 'GO', 'PR'];
