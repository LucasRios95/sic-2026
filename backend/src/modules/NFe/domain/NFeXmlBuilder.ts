import { create } from 'xmlbuilder2';
import type { XMLBuilder } from 'xmlbuilder2/lib/interfaces';

import { AmbienteSefaz, CodigoRegimeTributario } from '@modules/Companies/infra/typeorm/entities/Company';
import {
  CstIbsCbs,
  IndicadorIE,
  IndicadorIntermediador,
  IndicadorPresenca,
  TipoPessoa,
} from '@shared/types/fiscal-enums';

import { ChaveAcesso } from './ChaveAcesso';
import {
  FINALIDADE_CODIGO,
  FORMA_EMISSAO_CODIGO,
  TIPO_OPERACAO_CODIGO,
  UF_CODIGO,
} from './nfe-enums';
import { NFeDocument, NFeEndereco, NFeItem } from './NFeDocument';

/**
 * Compositor do XML da NF-e modelo 55. Recebe um NFeDocument (estrutura pura do domínio,
 * sem amarras com TypeORM) e devolve a string XML pronta para assinatura.
 *
 * Convenções aplicadas conforme MOC NF-e 7.00 + RT 2025.002:
 *  - Elemento raiz `NFe` com namespace `http://www.portalfiscal.inf.br/nfe`.
 *  - `infNFe` carrega `Id="NFe<chaveAcesso>"` — a referência da assinatura aponta para esse Id.
 *  - Valores decimais sempre em formato com ponto (não vírgula); o caller passa strings
 *    já formatadas pelo Money.toString(decimals) para evitar duplicação de regra.
 *  - Grupos opcionais (IBS/CBS, FCP, DIFAL, ST) só aparecem quando os campos relevantes
 *    estão definidos — o builder não emite tags vazias.
 *
 * IMPORTANTE: este builder NÃO valida contra XSD oficial. A validação completa exige
 * baixar os XSDs do Portal NF-e e usar libxmljs ou xmllint. Está documentado no README
 * como pendência da Fase 1a (TSK-100 critério de aceitação 1).
 */
export class NFeXmlBuilder {
  private static readonly NS = 'http://www.portalfiscal.inf.br/nfe';

  build(doc: NFeDocument): string {
    if (!ChaveAcesso.validate(doc.chaveAcesso)) {
      throw new Error('Chave de acesso inválida (DV não confere)');
    }

    const root = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('NFe', { xmlns: NFeXmlBuilder.NS });
    const infNFe = root.ele('infNFe', { Id: `NFe${doc.chaveAcesso}`, versao: '4.00' });

    this.appendIde(infNFe, doc);
    this.appendEmit(infNFe, doc);
    this.appendDest(infNFe, doc);
    for (const item of doc.itens) {
      this.appendDet(infNFe, item, doc);
    }
    this.appendTotal(infNFe, doc);
    this.appendTransp(infNFe, doc);
    this.appendPag(infNFe, doc);
    this.appendInfAdic(infNFe, doc);

    return root.end({ prettyPrint: false });
  }

  private appendIde(parent: XMLBuilder, doc: NFeDocument): void {
    const id = doc.identificacao;
    const ufEmit = doc.emitente.endereco.uf;
    const ele = parent.ele('ide');
    ele.ele('cUF').txt(UF_CODIGO[ufEmit]).up();
    ele.ele('cNF').txt(id.codigoNumerico).up();
    ele.ele('natOp').txt(id.naturezaOperacao).up();
    ele.ele('mod').txt(id.modelo).up();
    ele.ele('serie').txt(String(id.serie)).up();
    ele.ele('nNF').txt(String(id.numero)).up();
    ele.ele('dhEmi').txt(toISO(id.dhEmissao)).up();
    if (id.dhSaiEnt) ele.ele('dhSaiEnt').txt(toISO(id.dhSaiEnt)).up();
    ele.ele('tpNF').txt(TIPO_OPERACAO_CODIGO[id.tipoOperacao]).up();
    ele.ele('idDest').txt(String(id.idDest)).up();
    ele.ele('cMunFG').txt(doc.emitente.endereco.codigoMunicipioIbge).up();
    ele.ele('tpImp').txt('1').up(); // formato DANFE retrato (padrão)
    ele.ele('tpEmis').txt(FORMA_EMISSAO_CODIGO[id.formaEmissao]).up();
    ele.ele('cDV').txt(doc.chaveAcesso.slice(-1)).up();
    ele.ele('tpAmb').txt(id.ambiente === AmbienteSefaz.PRODUCAO ? '1' : '2').up();
    ele.ele('finNFe').txt(FINALIDADE_CODIGO[id.finalidade]).up();
    ele.ele('indFinal').txt(doc.destinatario.consumidorFinal ? '1' : '0').up();
    if (id.indicadorPresenca !== undefined) {
      ele.ele('indPres').txt(String(id.indicadorPresenca)).up();
    }
    // indIntermed obrigatório quando indPres é não-presencial (NT 2020.006).
    // Sem ele a SEFAZ retorna cStat 434. Quando o caller não informa explicitamente,
    // assumimos "sem intermediador" (0) — caso da venda direta sem marketplace.
    if (requiresIndIntermed(id.indicadorPresenca)) {
      const indInter = id.indicadorIntermediador ?? IndicadorIntermediador.SEM_INTERMEDIADOR;
      ele.ele('indIntermed').txt(String(indInter)).up();
    }
    ele.ele('procEmi').txt('0').up(); // 0 = emissão por aplicativo do contribuinte
    ele.ele('verProc').txt('sic-2026/0.1.0').up();
    // NFref deve ser o ÚLTIMO grupo dentro de <ide> conforme MOC NF-e 7.00.
    this.appendNFref(ele, doc);
  }

  /**
   * Emite o grupo NFref para cada documento fiscal referenciado. Obrigatório quando
   * finalidade ∈ {COMPLEMENTAR(2), AJUSTE(3), DEVOLUÇÃO(4)} — sem isso a SEFAZ rejeita
   * com cStat 526.
   */
  private appendNFref(parent: XMLBuilder, doc: NFeDocument): void {
    const refs = doc.identificacao.nfeReferenciadas;
    if (!refs || refs.length === 0) return;
    for (const ref of refs) {
      const nfRef = parent.ele('NFref');
      switch (ref.tipo) {
        case 'NFE':
          nfRef.ele('refNFe').txt(onlyDigits(ref.chaveAcesso)).up();
          break;
        case 'CTE':
          nfRef.ele('refCTe').txt(onlyDigits(ref.chaveAcesso)).up();
          break;
        case 'NF': {
          const g = nfRef.ele('refNF');
          g.ele('cUF').txt(ref.cUf).up();
          g.ele('AAMM').txt(ref.anoMes).up();
          g.ele('CNPJ').txt(onlyDigits(ref.cnpj)).up();
          g.ele('mod').txt(ref.modelo).up();
          g.ele('serie').txt(String(ref.serie)).up();
          g.ele('nNF').txt(String(ref.numero)).up();
          break;
        }
        case 'NFP': {
          const g = nfRef.ele('refNFP');
          g.ele('cUF').txt(ref.cUf).up();
          g.ele('AAMM').txt(ref.anoMes).up();
          g.ele(ref.cnpjOuCpf.kind).txt(onlyDigits(ref.cnpjOuCpf.valor)).up();
          g.ele('IE').txt(ref.ie).up();
          g.ele('mod').txt(ref.modelo).up();
          g.ele('serie').txt(String(ref.serie)).up();
          g.ele('nNF').txt(String(ref.numero)).up();
          break;
        }
      }
    }
  }

  private appendEmit(parent: XMLBuilder, doc: NFeDocument): void {
    const e = doc.emitente;
    const ele = parent.ele('emit');
    ele.ele('CNPJ').txt(onlyDigits(e.cnpj)).up();
    ele.ele('xNome').txt(clean(e.razaoSocial)).up();
    if (e.nomeFantasia) ele.ele('xFant').txt(clean(e.nomeFantasia)).up();
    this.appendEndereco(ele, 'enderEmit', e.endereco);
    if (e.ie) ele.ele('IE').txt(e.ie).up();
    // No schema, CNAE está aninhado num grupo que EXIGE IM antes (sequence{ IM, CNAE? }).
    // Emitir CNAE sem IM dispara cStat 225 ("CNAE não esperado"). Só emite CNAE com IM.
    if (e.im) {
      ele.ele('IM').txt(e.im).up();
      if (e.cnae) ele.ele('CNAE').txt(e.cnae).up();
    }
    ele.ele('CRT').txt(CRT_CODIGO[e.crt]).up();
  }

  private appendDest(parent: XMLBuilder, doc: NFeDocument): void {
    const d = doc.destinatario;
    const ele = parent.ele('dest');
    if (d.tipoPessoa === 'PJ') {
      ele.ele('CNPJ').txt(onlyDigits(d.cnpjCpf)).up();
    } else if (d.tipoPessoa === 'PF') {
      ele.ele('CPF').txt(onlyDigits(d.cnpjCpf)).up();
    } else {
      ele.ele('idEstrangeiro').txt(d.cnpjCpf).up();
    }
    // Regra antiga e estrita da SEFAZ (cStat 598): em ambiente de HOMOLOGAÇÃO, o nome
    // do destinatário no XML precisa ser literalmente "NF-E EMITIDA EM AMBIENTE DE
    // HOMOLOGACAO - SEM VALOR FISCAL" — proteção contra confusão com notas reais.
    // O banco continua guardando o nome real (a substituição é só na serialização do XML).
    const xNomeFinal =
      doc.identificacao.ambiente === AmbienteSefaz.HOMOLOGACAO
        ? 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL'
        : clean(d.nome);
    ele.ele('xNome').txt(xNomeFinal).up();
    this.appendEndereco(ele, 'enderDest', d.endereco);
    // indIEDest: SP/RJ/MG e outras SEFAZes rejeitam o código 2 (ISENTO) com cStat 805 —
    // a NT 2016.002 mantém os 3 códigos mas várias UFs descontinuaram o cadastro de
    // contribuintes ISENTOS, então a guidance pública é usar 9 (Não Contribuinte) no
    // lugar. PF nunca tem IE — força 9 mesmo se o cadastro veio com outro valor (dado ruim).
    let indIEFinal: IndicadorIE = d.indicadorIE;
    if (d.tipoPessoa === 'PF') indIEFinal = IndicadorIE.NAO_CONTRIBUINTE;
    else if (indIEFinal === IndicadorIE.ISENTO) indIEFinal = IndicadorIE.NAO_CONTRIBUINTE;
    ele.ele('indIEDest').txt(IND_IE_CODIGO[indIEFinal]).up();
    if (d.ie && indIEFinal === IndicadorIE.CONTRIBUINTE) ele.ele('IE').txt(d.ie).up();
    if (d.suframa) ele.ele('ISUF').txt(d.suframa).up();
    if (d.email) ele.ele('email').txt(d.email).up();
  }

  private appendEndereco(parent: XMLBuilder, tag: string, end: NFeEndereco): void {
    const ele = parent.ele(tag);
    // clean(): TString do schema não aceita espaço no início/fim (facet 'pattern') —
    // endereço com espaço sobrando (ex.: "Avenida X ") dispara cStat 225.
    ele.ele('xLgr').txt(clean(end.logradouro)).up();
    ele.ele('nro').txt(clean(end.numero)).up();
    if (end.complemento) ele.ele('xCpl').txt(clean(end.complemento)).up();
    ele.ele('xBairro').txt(clean(end.bairro)).up();
    ele.ele('cMun').txt(end.codigoMunicipioIbge).up();
    ele.ele('xMun').txt(clean(end.municipio)).up();
    ele.ele('UF').txt(end.uf).up();
    ele.ele('CEP').txt(end.cep).up();
    ele.ele('cPais').txt(end.codigoPais ?? '1058').up();
    ele.ele('xPais').txt(end.pais ?? 'BRASIL').up();
    if (end.telefone) ele.ele('fone').txt(onlyDigits(end.telefone)).up();
  }

  private appendDet(parent: XMLBuilder, item: NFeItem, doc: NFeDocument): void {
    const det = parent.ele('det', { nItem: String(item.numero) });
    const prod = det.ele('prod');
    prod.ele('cProd').txt(item.codigo).up();
    prod.ele('cEAN').txt(item.ean ?? 'SEM GTIN').up();
    prod.ele('xProd').txt(item.descricao).up();
    prod.ele('NCM').txt(item.ncm).up();
    if (item.cest) prod.ele('CEST').txt(item.cest).up();
    prod.ele('CFOP').txt(item.cfop).up();
    prod.ele('uCom').txt(item.unidadeComercial).up();
    prod.ele('qCom').txt(item.quantidadeComercial).up();
    prod.ele('vUnCom').txt(item.valorUnitario).up();
    prod.ele('vProd').txt(item.valorTotal).up();
    prod.ele('cEANTrib').txt(item.ean ?? 'SEM GTIN').up();
    prod.ele('uTrib').txt(item.unidadeTributavel).up();
    prod.ele('qTrib').txt(item.quantidadeTributavel).up();
    prod.ele('vUnTrib').txt(item.valorUnitarioTrib).up();
    if (item.valorFrete) prod.ele('vFrete').txt(item.valorFrete).up();
    if (item.valorSeguro) prod.ele('vSeg').txt(item.valorSeguro).up();
    if (item.valorDesconto) prod.ele('vDesc').txt(item.valorDesconto).up();
    if (item.valorOutros) prod.ele('vOutro').txt(item.valorOutros).up();
    prod.ele('indTot').txt('1').up();

    const imposto = det.ele('imposto');
    this.appendIcms(imposto, item);
    this.appendIpi(imposto, item);
    this.appendPisCofins(imposto, item);
    // Ordem do schema RTC: ICMSUFDest → IS → IBSCBS (os grupos da Reforma são os últimos).
    this.appendIcmsUfDest(imposto, item);
    this.appendIbsCbsIs(imposto, item);

    if (item.infAdProd) det.ele('infAdProd').txt(item.infAdProd).up();
    // Suprime warning de "doc not used"; mantemos a assinatura para futuras adições por item
    // que dependam do documento (regras condicionais por UF emitente, etc.).
    void doc;
  }

  private appendIcms(imposto: XMLBuilder, item: NFeItem): void {
    if (!item.cstIcms && !item.csosnIcms) return;
    const icms = imposto.ele('ICMS');

    if (item.csosnIcms) {
      // Simples Nacional — usa CSOSN. ATENÇÃO: o schema NÃO tem um elemento por CSOSN;
      // vários CSOSN compartilham o mesmo grupo (ex.: 102/103/300/400 → ICMSSN102). Usar
      // `ICMSSN${csosn}` direto gera elementos inexistentes (ex.: ICMSSN400) e dispara 225.
      const csosn = item.csosnIcms;
      const group = icms.ele(icmsSnGroupName(csosn));
      group.ele('orig').txt(String(item.origem)).up();
      group.ele('CSOSN').txt(csosn).up();

      // Grupos com ST (201/202/203): campos de ST quando informados (ordem do schema).
      if (['201', '202', '203'].includes(csosn) && item.baseIcmsST) {
        if (item.modBCST !== undefined) group.ele('modBCST').txt(String(item.modBCST)).up();
        if (item.pMVAST) group.ele('pMVAST').txt(item.pMVAST).up();
        group.ele('vBCST').txt(item.baseIcmsST).up();
        if (item.aliqIcmsST) group.ele('pICMSST').txt(item.aliqIcmsST).up();
        if (item.valorIcmsST) group.ele('vICMSST').txt(item.valorIcmsST).up();
      }

      // ICMSSN900 pode carregar ICMS próprio (campos opcionais).
      if (csosn === '900' && item.baseIcms && item.aliqIcms) {
        if (item.modBC !== undefined) group.ele('modBC').txt(String(item.modBC)).up();
        group.ele('vBC').txt(item.baseIcms).up();
        if (item.pRedBC) group.ele('pRedBC').txt(item.pRedBC).up();
        group.ele('pICMS').txt(item.aliqIcms).up();
        group.ele('vICMS').txt(item.valorIcms ?? '0.00').up();
      }

      // Crédito do Simples: obrigatório em 101/201; opcional em 900 (quando há alíquota).
      // ICMSSN102 (102/103/300/400) e ICMSSN500 NÃO têm crédito.
      if (csosn === '101' || csosn === '201' || (csosn === '900' && item.aliqIcms)) {
        group.ele('pCredSN').txt(item.aliqIcms ?? '0.0000').up();
        group.ele('vCredICMSSN').txt(item.valorIcms ?? '0.00').up();
      }
      return;
    }

    // Regime normal — usa CST.
    const groupName = `ICMS${item.cstIcms!.padStart(2, '0')}`;
    const group = icms.ele(groupName);
    group.ele('orig').txt(String(item.origem)).up();
    group.ele('CST').txt(item.cstIcms!).up();
    // modBC é OBRIGATÓRIO no schema para os CST com base própria (00,10,20,51,70,90) e
    // deve preceder vBC. Omitir dispara cStat 225 ("Expected is modBC"). Quando a regra
    // não informa, default 3 = Valor da operação (modalidade mais comum).
    if (item.baseIcms) {
      group.ele('modBC').txt(String(item.modBC ?? 3)).up();
      group.ele('vBC').txt(item.baseIcms).up();
    }
    if (item.pRedBC) group.ele('pRedBC').txt(item.pRedBC).up();
    if (item.aliqIcms) group.ele('pICMS').txt(item.aliqIcms).up();
    if (item.valorIcms) group.ele('vICMS').txt(item.valorIcms).up();
    if (item.pFCP) {
      if (item.baseFCP) group.ele('vBCFCP').txt(item.baseFCP).up();
      group.ele('pFCP').txt(item.pFCP).up();
      if (item.valorFCP) group.ele('vFCP').txt(item.valorFCP).up();
    }
    if (item.cstIcmsSt && item.baseIcmsST) {
      if (item.modBCST !== undefined) group.ele('modBCST').txt(String(item.modBCST)).up();
      if (item.pMVAST) group.ele('pMVAST').txt(item.pMVAST).up();
      group.ele('vBCST').txt(item.baseIcmsST).up();
      if (item.aliqIcmsST) group.ele('pICMSST').txt(item.aliqIcmsST).up();
      if (item.valorIcmsST) group.ele('vICMSST').txt(item.valorIcmsST).up();
    }
    if (item.motDesICMS !== undefined && item.valorIcmsDeson) {
      group.ele('vICMSDeson').txt(item.valorIcmsDeson).up();
      group.ele('motDesICMS').txt(String(item.motDesICMS)).up();
    }
    if (item.cBenef) group.ele('cBenef').txt(item.cBenef).up();
  }

  private appendIcmsUfDest(imposto: XMLBuilder, item: NFeItem): void {
    if (!item.valorICMSUFDest) return;
    const g = imposto.ele('ICMSUFDest');
    if (item.baseICMSUFDest) g.ele('vBCUFDest').txt(item.baseICMSUFDest).up();
    if (item.baseFCPUFDest) g.ele('vBCFCPUFDest').txt(item.baseFCPUFDest).up();
    if (item.pFCPUFDest) g.ele('pFCPUFDest').txt(item.pFCPUFDest).up();
    if (item.pICMSUFDest) g.ele('pICMSUFDest').txt(item.pICMSUFDest).up();
    if (item.pICMSInter) g.ele('pICMSInter').txt(item.pICMSInter).up();
    g.ele('pICMSInterPart').txt('100.0000').up(); // 100% para UF destino a partir de 2019
    if (item.valorFCPUFDest) g.ele('vFCPUFDest').txt(item.valorFCPUFDest).up();
    g.ele('vICMSUFDest').txt(item.valorICMSUFDest).up();
    g.ele('vICMSUFRemet').txt(item.valorICMSUFRemet ?? '0.00').up();
  }

  private appendIpi(imposto: XMLBuilder, item: NFeItem): void {
    if (!item.cstIpi) return;
    const ipi = imposto.ele('IPI');
    if (item.cEnq) ipi.ele('cEnq').txt(item.cEnq).up();
    const isTributado = ['00', '49', '50', '99'].includes(item.cstIpi);
    const group = ipi.ele(isTributado ? 'IPITrib' : 'IPINT');
    group.ele('CST').txt(item.cstIpi).up();
    if (isTributado) {
      if (item.baseIpi) group.ele('vBC').txt(item.baseIpi).up();
      if (item.aliqIpi) group.ele('pIPI').txt(item.aliqIpi).up();
      if (item.valorIpi) group.ele('vIPI').txt(item.valorIpi).up();
    }
  }

  /**
   * Grupos PIS e COFINS — OBRIGATÓRIOS por item (a ausência dispara cStat 745 "NF-e sem
   * grupo do PIS" / equivalente do COFINS). Quando o produto não tem CST configurado na
   * regra, emitimos CST 49 (Outras Operações de Saída) com valores zerados — padrão correto
   * para Simples Nacional (PIS/COFINS recolhidos no DAS, sem destaque na nota) e fallback
   * seguro. Produtos do Regime Normal com PIS/COFINS efetivo DEVEM configurar o CST/alíquota
   * reais na regra tributária — caso contrário sairão zerados.
   */
  private appendPisCofins(imposto: XMLBuilder, item: NFeItem): void {
    const cstPis = item.cstPis ?? '49';
    const pis = imposto.ele('PIS').ele(pisGroupName(cstPis));
    pis.ele('CST').txt(cstPis).up();
    if (pisGroupName(cstPis) !== 'PISNT') {
      // PISAliq/PISOutr exigem vBC + pPIS + vPIS. Default zero quando não calculado.
      pis.ele('vBC').txt(item.basePis ?? '0.00').up();
      pis.ele('pPIS').txt(item.aliqPis ?? '0.0000').up();
      pis.ele('vPIS').txt(item.valorPis ?? '0.00').up();
    }

    const cstCofins = item.cstCofins ?? '49';
    const cofins = imposto.ele('COFINS').ele(cofinsGroupName(cstCofins));
    cofins.ele('CST').txt(cstCofins).up();
    if (cofinsGroupName(cstCofins) !== 'COFINSNT') {
      cofins.ele('vBC').txt(item.baseCofins ?? '0.00').up();
      cofins.ele('pCOFINS').txt(item.aliqCofins ?? '0.0000').up();
      cofins.ele('vCOFINS').txt(item.valorCofins ?? '0.00').up();
    }
  }

  /**
   * Grupos IS e IBS/CBS conforme RT 2025.002 (NT 2025.002 / LC 214/2025).
   *
   * Ordem no schema: o grupo `IS` (Imposto Seletivo) precede o `IBSCBS`. Dentro do
   * IBSCBS, os valores ficam aninhados em `gIBSCBS` com o IBS dividido em parcela
   * estadual (`gIBSUF`) e municipal (`gIBSMun`), seguidos do total `vIBS` e do `gCBS`:
   *
   *   IBSCBS → CST, cClassTrib, gIBSCBS{ vBC, gIBSUF{pIBSUF,vIBSUF},
   *            gIBSMun{pIBSMun,vIBSMun}, vIBS, gCBS{pCBS,vCBS} }
   *
   * Para CST sem tributação (ISENCAO, IMUNIDADE, NAO_INCIDENCIA) o motor não preenche
   * `baseIbsCbs`, então apenas CST + cClassTrib são emitidos (o grupo de valores some).
   */
  private appendIbsCbsIs(imposto: XMLBuilder, item: NFeItem): void {
    // IS (Imposto Seletivo) vem antes do IBSCBS na sequência do imposto.
    if (item.cstIs) {
      const isGroup = imposto.ele('IS');
      isGroup.ele('CST').txt(item.cstIs).up();
      if (item.aliqIs) isGroup.ele('pIS').txt(item.aliqIs).up();
      if (item.valorIs) isGroup.ele('vIS').txt(item.valorIs).up();
    }

    if (!item.cstIbsCbs) return;
    const g = imposto.ele('IBSCBS');
    // CST do IBS/CBS é código numérico de 3 dígitos (000, 200, …). O domínio guarda o
    // enum (TRIBUTACAO_INTEGRAL…); aqui mapeamos para o código oficial exigido pelo XSD.
    g.ele('CST').txt(CST_IBSCBS_CODIGO[item.cstIbsCbs]).up();
    // cClassTrib é obrigatório e ENUMERADO no XSD (não é texto livre) — código fora da
    // tabela oficial dispara cStat 225. Default defensivo: '000001' (tributação integral)
    // quando a regra do produto não trouxe. ATENÇÃO: o valor real precisa vir do cadastro
    // do produto com um código válido da tabela cClassTrib (IT 2025.002).
    g.ele('cClassTrib').txt(item.cClassTrib ?? '000001').up();

    if (item.baseIbsCbs) {
      const gIbsCbs = g.ele('gIBSCBS');
      gIbsCbs.ele('vBC').txt(item.baseIbsCbs).up();

      // O IBS divide-se em parcela estadual (gIBSUF) e municipal (gIBSMun). A
      // CalculadoraIbsCbs ainda apura o IBS de forma agregada (sem rateio UF/Mun), então
      // alocamos o total na parcela estadual e zeramos a municipal: vIBS = vIBSUF +
      // vIBSMun permanece coerente e o schema valida. O rateio real entra quando o motor
      // separar pIBSUF/pIBSMun.
      const vIbs = item.valorIbs ?? '0.00';
      const gUf = gIbsCbs.ele('gIBSUF');
      gUf.ele('pIBSUF').txt(item.aliqIbs ?? '0.0000').up();
      gUf.ele('vIBSUF').txt(vIbs).up();
      const gMun = gIbsCbs.ele('gIBSMun');
      gMun.ele('pIBSMun').txt('0.0000').up();
      gMun.ele('vIBSMun').txt('0.00').up();
      gIbsCbs.ele('vIBS').txt(vIbs).up();
      const gCbs = gIbsCbs.ele('gCBS');
      gCbs.ele('pCBS').txt(item.aliqCbs ?? '0.0000').up();
      gCbs.ele('vCBS').txt(item.valorCbs ?? '0.00').up();
    }
  }

  private appendTotal(parent: XMLBuilder, doc: NFeDocument): void {
    const t = doc.totais;
    const total = parent.ele('total');
    const icmsTot = total.ele('ICMSTot');
    icmsTot.ele('vBC').txt(t.baseIcms).up();
    icmsTot.ele('vICMS').txt(t.valorIcms).up();
    icmsTot.ele('vICMSDeson').txt(t.valorIcmsDeson).up();
    icmsTot.ele('vFCPUFDest').txt(t.valorFCPUFDest).up();
    icmsTot.ele('vICMSUFDest').txt(t.valorICMSUFDest).up();
    icmsTot.ele('vICMSUFRemet').txt(t.valorICMSUFRemet).up();
    icmsTot.ele('vFCP').txt(t.valorFCP).up();
    icmsTot.ele('vBCST').txt(t.baseIcmsST).up();
    icmsTot.ele('vST').txt(t.valorIcmsST).up();
    icmsTot.ele('vFCPST').txt(t.valorFCPST).up();
    icmsTot.ele('vFCPSTRet').txt(t.valorFCPSTRet).up();
    icmsTot.ele('vProd').txt(t.valorProdutos).up();
    icmsTot.ele('vFrete').txt(t.valorFrete).up();
    icmsTot.ele('vSeg').txt(t.valorSeguro).up();
    icmsTot.ele('vDesc').txt(t.valorDesconto).up();
    icmsTot.ele('vII').txt(t.valorII).up();
    icmsTot.ele('vIPI').txt(t.valorIpi).up();
    icmsTot.ele('vIPIDevol').txt('0.00').up();
    icmsTot.ele('vPIS').txt(t.valorPis).up();
    icmsTot.ele('vCOFINS').txt(t.valorCofins).up();
    icmsTot.ele('vOutro').txt(t.valorOutros).up();
    icmsTot.ele('vNF').txt(t.valorTotal).up();
    icmsTot.ele('vTotTrib').txt(t.valorTotTrib).up();

    // Totais Reforma (RT 2025.002) — grupo IBSCBSTot:
    //   vBCIBSCBS, gIBS{ gIBSUF{vDif,vDevTrib,vIBSUF}, gIBSMun{vDif,vDevTrib,vIBSMun},
    //   vIBS, vCredPres, vCredPresCondSus }, gCBS{ vDif,vDevTrib,vCBS,vCredPres,
    //   vCredPresCondSus }. Coerente com o rateio do item: todo o IBS na parcela UF.
    if (Number(t.valorIbs) > 0 || Number(t.valorCbs) > 0 || Number(t.valorIs) > 0) {
      const tot = total.ele('IBSCBSTot');
      tot.ele('vBCIBSCBS').txt(t.baseIbsCbs).up();

      const gIbs = tot.ele('gIBS');
      const gUf = gIbs.ele('gIBSUF');
      gUf.ele('vDif').txt('0.00').up();
      gUf.ele('vDevTrib').txt('0.00').up();
      gUf.ele('vIBSUF').txt(t.valorIbs).up();
      const gMun = gIbs.ele('gIBSMun');
      gMun.ele('vDif').txt('0.00').up();
      gMun.ele('vDevTrib').txt('0.00').up();
      gMun.ele('vIBSMun').txt('0.00').up();
      gIbs.ele('vIBS').txt(t.valorIbs).up();
      gIbs.ele('vCredPres').txt('0.00').up();
      gIbs.ele('vCredPresCondSus').txt('0.00').up();

      const gCbs = tot.ele('gCBS');
      gCbs.ele('vDif').txt('0.00').up();
      gCbs.ele('vDevTrib').txt('0.00').up();
      gCbs.ele('vCBS').txt(t.valorCbs).up();
      gCbs.ele('vCredPres').txt('0.00').up();
      gCbs.ele('vCredPresCondSus').txt('0.00').up();
    }
  }

  /**
   * Bloco `<transp>` — modFrete obrigatório, transportadora/veículo/volumes opcionais.
   * Ordem dos sub-elementos segue o MOC: modFrete → transporta → veicTransp → vol.
   */
  private appendTransp(parent: XMLBuilder, doc: NFeDocument): void {
    const t = doc.transporte;
    const transp = parent.ele('transp');
    transp.ele('modFrete').txt(String(t.modalidadeFrete)).up();

    if (t.transportadora && hasTransportadoraData(t.transportadora)) {
      const tr = transp.ele('transporta');
      if (t.transportadora.cnpjCpf) {
        const digits = onlyDigits(t.transportadora.cnpjCpf);
        tr.ele(digits.length === 14 ? 'CNPJ' : 'CPF').txt(digits).up();
      }
      if (t.transportadora.ie) tr.ele('IE').txt(t.transportadora.ie).up();
      if (t.transportadora.nome) tr.ele('xNome').txt(t.transportadora.nome).up();
      if (t.transportadora.endereco) tr.ele('xEnder').txt(t.transportadora.endereco).up();
      if (t.transportadora.municipio) tr.ele('xMun').txt(t.transportadora.municipio).up();
      if (t.transportadora.uf) tr.ele('UF').txt(t.transportadora.uf).up();
    }

    if (t.veiculo) {
      const v = transp.ele('veicTransp');
      v.ele('placa').txt(t.veiculo.placa.replace(/[^A-Z0-9]/gi, '').toUpperCase()).up();
      v.ele('UF').txt(t.veiculo.uf).up();
      if (t.veiculo.rntc) v.ele('RNTC').txt(t.veiculo.rntc).up();
    }

    if (t.volumes && t.volumes.length > 0) {
      for (const vol of t.volumes) {
        const v = transp.ele('vol');
        if (vol.quantidade !== undefined) v.ele('qVol').txt(String(vol.quantidade)).up();
        if (vol.especie) v.ele('esp').txt(vol.especie).up();
        if (vol.marca) v.ele('marca').txt(vol.marca).up();
        if (vol.numeracao) v.ele('nVol').txt(vol.numeracao).up();
        if (vol.pesoLiquido) v.ele('pesoL').txt(vol.pesoLiquido).up();
        if (vol.pesoBruto) v.ele('pesoB').txt(vol.pesoBruto).up();
      }
    }
  }

  private appendPag(parent: XMLBuilder, doc: NFeDocument): void {
    const pag = parent.ele('pag');
    for (const p of doc.pagamentos) {
      const det = pag.ele('detPag');
      det.ele('tPag').txt(p.meio).up();
      det.ele('vPag').txt(p.valor).up();
      if (p.bandeira) {
        const card = det.ele('card');
        card.ele('tpIntegra').txt('2').up();
        card.ele('tBand').txt(p.bandeira).up();
      }
    }
  }

  private appendInfAdic(parent: XMLBuilder, doc: NFeDocument): void {
    if (!doc.informacoesAdicionais && !doc.informacoesFisco) return;
    const info = parent.ele('infAdic');
    if (doc.informacoesFisco) info.ele('infAdFisco').txt(doc.informacoesFisco).up();
    if (doc.informacoesAdicionais) info.ele('infCpl').txt(doc.informacoesAdicionais).up();
  }
}

const CRT_CODIGO: Record<CodigoRegimeTributario, string> = {
  [CodigoRegimeTributario.SIMPLES_NACIONAL]: '1',
  [CodigoRegimeTributario.SIMPLES_EXCESSO_SUBLIMITE]: '2',
  [CodigoRegimeTributario.REGIME_NORMAL]: '3',
  [CodigoRegimeTributario.MEI]: '4',
};

/**
 * CST do IBS/CBS → código numérico de 3 dígitos exigido pelo XSD (NT 2025.002).
 * O domínio modela o CST como enum nomeado; o XML precisa do código da tabela oficial.
 */
const CST_IBSCBS_CODIGO: Record<CstIbsCbs, string> = {
  [CstIbsCbs.TRIBUTACAO_INTEGRAL]: '000',
  [CstIbsCbs.REDUCAO_ALIQUOTA]: '200',
  [CstIbsCbs.REDUCAO_BASE_CALCULO]: '210',
  [CstIbsCbs.DIFERIMENTO]: '410',
  [CstIbsCbs.SUSPENSAO]: '510',
  [CstIbsCbs.ISENCAO]: '610',
  [CstIbsCbs.IMUNIDADE]: '620',
  [CstIbsCbs.NAO_INCIDENCIA]: '630',
  [CstIbsCbs.CREDITO_PRESUMIDO]: '800',
};

const IND_IE_CODIGO: Record<string, string> = {
  CONTRIBUINTE: '1',
  ISENTO: '2',
  NAO_CONTRIBUINTE: '9',
};
// Suprime warning sobre TipoPessoa importado para uso no contrato; runtime usa o campo direto.
void TipoPessoa;

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Normaliza texto livre para o padrão TString do schema: o pattern oficial não aceita
 * espaço no início nem no fim. Faz trim e colapsa espaços internos repetidos. Sem isso,
 * um endereço/nome com espaço sobrando dispara cStat 225 (facet 'pattern').
 */
function clean(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/**
 * `indIntermed` é obrigatório nos cenários não-presenciais (NT 2020.006). Para
 * presencial dentro do estabelecimento (1) e "não se aplica" (0), o campo NÃO
 * pode ser enviado — o schema impede.
 */
function requiresIndIntermed(indPres: IndicadorPresenca | undefined): boolean {
  if (indPres === undefined) return false;
  return [
    IndicadorPresenca.INTERNET,
    IndicadorPresenca.TELEATENDIMENTO,
    IndicadorPresenca.ENTREGA_EM_DOMICILIO,
    IndicadorPresenca.PRESENCIAL_FORA_ESTABELECIMENTO,
    IndicadorPresenca.OUTROS,
  ].includes(indPres);
}

function toISO(d: Date): string {
  // Schema NF-e 4.00 (TData) exige YYYY-MM-DDTHH:MM:SS±HH:MM — SEM milissegundos e
  // SEM o sufixo "Z" do UTC. Date.toISOString() devolve "2026-05-28T12:03:53.098Z",
  // o que dispara cStat 225 (Falha no Schema XML).
  //
  // Estratégia: serializa em horário do fuso de São Paulo (UTC−03:00) — Brasil não
  // observa horário de verão desde 2019, então o offset é constante. Se a operação
  // precisar de outro fuso (Acre etc.), trocar a constante; suporte multi-fuso fica
  // para quando houver demanda de cliente.
  const OFFSET_MIN = -180; // UTC−03:00
  const local = new Date(d.getTime() + OFFSET_MIN * 60_000);
  const yyyy = local.getUTCFullYear();
  const mm = String(local.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(local.getUTCDate()).padStart(2, '0');
  const hh = String(local.getUTCHours()).padStart(2, '0');
  const mi = String(local.getUTCMinutes()).padStart(2, '0');
  const ss = String(local.getUTCSeconds()).padStart(2, '0');
  const sign = OFFSET_MIN <= 0 ? '-' : '+';
  const offH = String(Math.floor(Math.abs(OFFSET_MIN) / 60)).padStart(2, '0');
  const offM = String(Math.abs(OFFSET_MIN) % 60).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}${sign}${offH}:${offM}`;
}

/**
 * Mapeia o CSOSN para o nome do GRUPO no schema. O leiaute não tem um elemento por CSOSN —
 * vários códigos compartilham o mesmo grupo. Errar isso (ex.: `ICMSSN400`) dispara cStat 225.
 *  - 101 → ICMSSN101 | 102/103/300/400 → ICMSSN102 | 201 → ICMSSN201
 *  - 202/203 → ICMSSN202 | 500 → ICMSSN500 | 900 (e demais) → ICMSSN900
 */
function icmsSnGroupName(csosn: string): string {
  if (csosn === '101') return 'ICMSSN101';
  if (['102', '103', '300', '400'].includes(csosn)) return 'ICMSSN102';
  if (csosn === '201') return 'ICMSSN201';
  if (['202', '203'].includes(csosn)) return 'ICMSSN202';
  if (csosn === '500') return 'ICMSSN500';
  return 'ICMSSN900';
}

/**
 * Nome do grupo PIS conforme tabela MOC: CST 01/02 → PISAliq, 03 → PISQtde, 04..09 → PISNT,
 * 49/50/51..59/60..70/99 → PISOutr. Simplificado: tributado direto → PISAliq, demais → PISOutr.
 */
function pisGroupName(cst: string): string {
  if (cst === '01' || cst === '02') return 'PISAliq';
  if (cst === '03') return 'PISQtde';
  if (['04', '05', '06', '07', '08', '09'].includes(cst)) return 'PISNT';
  return 'PISOutr';
}

function cofinsGroupName(cst: string): string {
  if (cst === '01' || cst === '02') return 'COFINSAliq';
  if (cst === '03') return 'COFINSQtde';
  if (['04', '05', '06', '07', '08', '09'].includes(cst)) return 'COFINSNT';
  return 'COFINSOutr';
}

function hasTransportadoraData(t: NonNullable<NFeDocument['transporte']['transportadora']>): boolean {
  return Boolean(t.cnpjCpf || t.nome || t.ie || t.endereco || t.municipio || t.uf);
}
