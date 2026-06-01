import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';
import React from 'react';

import {
  AmbienteSefaz,
  Company,
} from '@modules/Companies/infra/typeorm/entities/Company';
import { Customer } from '@modules/Customers/infra/typeorm/entities/Customer';

import { NFe } from '../typeorm/entities/NFe';
import { NFeItem } from '../typeorm/entities/NFeItem';
import { formatChaveAcesso } from './barcode';

/**
 * Componente React-PDF que renderiza o DANFE da NF-e modelo 55.
 *
 * Leiaute baseado no Manual de Padrões Técnicos do DANFE (NT 2008/004, Anexo II),
 * em A4 retrato, organizado nos quadros padrão:
 *  1. Tarja "SEM VALOR FISCAL" — só em ambiente de homologação
 *  2. Canhoto (recibo de entrega) — recortável no topo
 *  3. Identificação do Emitente + DANFE/chave/barcode + Inscrições
 *  4. Destinatário/Remetente
 *  5. Fatura/Duplicatas — só renderiza quando há valor de fatura
 *  6. Cálculo do Imposto (regime antigo)
 *  7. Cálculo da Reforma (IBS/CBS/IS) — quadro extra para transição RT 2025.002
 *  8. Transportador/Volumes Transportados
 *  9. Dados dos Produtos/Serviços
 *  10. Dados Adicionais (informações complementares + reservado ao fisco)
 *
 * Campos de transportador/volumes ainda não são persistidos pela camada de dados — o
 * quadro renderiza com modalidade de frete extraída do XML quando disponível, demais
 * campos vazios. Quando a entidade evoluir, basta passar dados estruturados.
 */

const COLORS = {
  border: '#000',
  borderSoft: '#555',
  labelText: '#444',
  fiscoBg: '#f4f4f4',
  homologTarja: '#ffeb3b',
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 12,
    fontSize: 7,
    fontFamily: 'Helvetica',
    color: '#000',
  },
  // Tarja amarela de homologação
  tarja: {
    backgroundColor: COLORS.homologTarja,
    color: '#000',
    paddingVertical: 3,
    fontSize: 9,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  // Bordas e grid
  box: { borderWidth: 1, borderColor: COLORS.border },
  boxNoTop: { borderWidth: 1, borderTopWidth: 0, borderColor: COLORS.border },
  row: { flexDirection: 'row' },
  colBorderRight: { borderRightWidth: 1, borderRightColor: COLORS.border },
  colBorderBottom: { borderBottomWidth: 1, borderBottomColor: COLORS.border },

  // Field (label em cima, valor embaixo)
  field: { paddingHorizontal: 3, paddingVertical: 1 },
  fieldLabel: { fontSize: 5, color: COLORS.labelText, fontWeight: 'bold' },
  fieldValue: { fontSize: 8, marginTop: 1 },

  // Cabeçalho de quadro (banda cinza com nome do bloco)
  quadroTitle: {
    fontSize: 6,
    fontWeight: 'bold',
    color: COLORS.labelText,
    paddingHorizontal: 3,
    paddingVertical: 1,
    backgroundColor: COLORS.fiscoBg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },

  // Bloco emitente
  emitNome: { fontSize: 11, fontWeight: 'bold' },
  emitLine: { fontSize: 7, marginTop: 1 },
  danfeTitle: { fontSize: 13, fontWeight: 'bold', textAlign: 'center' },
  danfeSubtitle: { fontSize: 7, textAlign: 'center', marginBottom: 2 },
  danfeBadge: {
    fontSize: 8,
    textAlign: 'center',
    marginTop: 2,
    fontWeight: 'bold',
  },
  bigNumero: { fontSize: 11, fontWeight: 'bold', textAlign: 'center' },

  // Chave/barcode
  chaveLabel: { fontSize: 6, color: COLORS.labelText, textAlign: 'center' },
  chaveValue: { fontSize: 8, letterSpacing: 0.6, textAlign: 'center', marginTop: 1 },
  barcode: { width: '100%', height: 28, marginTop: 2 },
  qrcode: { width: 70, height: 70 },

  // Tabela de itens
  itemsHeaderRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.fiscoBg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  itemsHeaderCell: {
    fontSize: 5,
    fontWeight: 'bold',
    color: COLORS.labelText,
    paddingHorizontal: 2,
    paddingVertical: 2,
    borderRightWidth: 0.5,
    borderRightColor: COLORS.borderSoft,
  },
  itemRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.3,
    borderBottomColor: COLORS.borderSoft,
  },
  itemCell: {
    fontSize: 6,
    paddingHorizontal: 2,
    paddingVertical: 1,
    borderRightWidth: 0.5,
    borderRightColor: COLORS.borderSoft,
  },

  // Canhoto
  canhotoLeft: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    padding: 4,
  },
  canhotoRight: { width: 60, padding: 4, justifyContent: 'center' },
  canhotoText: { fontSize: 7, lineHeight: 1.3 },
  canhotoAssinatura: {
    fontSize: 6,
    color: COLORS.labelText,
    marginTop: 4,
  },
  dashedLine: {
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSoft,
    borderStyle: 'dashed',
    marginTop: 2,
    marginBottom: 4,
  },

  // Utilidades
  bold: { fontWeight: 'bold' },
  textRight: { textAlign: 'right' },
  textCenter: { textAlign: 'center' },
});

// Larguras (% sobre a largura útil) das colunas da tabela de itens.
const ITEM_COLS = {
  codigo: 7,
  descricao: 22,
  ncm: 7,
  cst: 6,
  cfop: 5,
  un: 4,
  qtd: 6,
  vUnit: 8,
  vTotal: 8,
  bcIcms: 7,
  vIcms: 6,
  vIpi: 5,
  pIcms: 4.5,
  pIpi: 4.5,
};

const TIPO_OPERACAO_LABEL: Record<string, string> = {
  ENTRADA: '0 - ENTRADA',
  SAIDA: '1 - SAÍDA',
};

const MOD_FRETE_LABEL: Record<string, string> = {
  '0': '0 - Por conta do Emitente',
  '1': '1 - Por conta do Dest.',
  '2': '2 - Por conta de Terceiros',
  '3': '3 - Próprio Remetente',
  '4': '4 - Próprio Destinatário',
  '9': '9 - Sem ocorrência',
};

export interface DanfeProps {
  nfe: NFe & { items: NFeItem[] };
  emitente: Company;
  destinatario: Customer | null;
  barcodePng: Buffer;
  qrCodePng?: Buffer;
}

export function DanfeDocument({
  nfe,
  emitente,
  destinatario,
  barcodePng,
  qrCodePng,
}: DanfeProps): React.ReactElement {
  const isHomologacao = nfe.ambiente === AmbienteSefaz.HOMOLOGACAO;
  const chave = nfe.chaveAcesso ?? '';
  const barcodeUri = `data:image/png;base64,${barcodePng.toString('base64')}`;
  const qrUri = qrCodePng ? `data:image/png;base64,${qrCodePng.toString('base64')}` : null;
  const dhEmissao = new Date(nfe.dhEmissao);
  const dhSaiEnt = nfe.dhSaiEnt ? new Date(nfe.dhSaiEnt) : null;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {isHomologacao && (
          <View style={styles.tarja}>
            <Text>SEM VALOR FISCAL — AMBIENTE DE HOMOLOGAÇÃO</Text>
          </View>
        )}

        {/* ===== CANHOTO (Recibo de Entrega) ===== */}
        {destinatario && (
          <View style={[styles.box, styles.row, { marginBottom: 4 }]}>
            <View style={styles.canhotoLeft}>
              <Text style={styles.canhotoText}>
                RECEBEMOS DE <Text style={styles.bold}>{emitente.razaoSocial}</Text> OS
                PRODUTOS / SERVIÇOS CONSTANTES DA NOTA FISCAL ELETRÔNICA INDICADA AO LADO.
                EMISSÃO {fmtDateTime(dhEmissao)} VALOR TOTAL R$ {formatDecimal(nfe.valorTotal)} —{' '}
                DESTINATÁRIO: {destinatario.nomeRazao} —{' '}
                {[
                  destinatario.logradouro,
                  destinatario.numero,
                  destinatario.bairro,
                  destinatario.municipio,
                  destinatario.uf,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </Text>
              <View style={[styles.row, { marginTop: 8 }]}>
                <View style={{ width: '30%' }}>
                  <Text style={styles.canhotoAssinatura}>DATA DE RECEBIMENTO</Text>
                  <Text style={[styles.canhotoText, { marginTop: 8 }]}>__________</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.canhotoAssinatura}>
                    IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR
                  </Text>
                  <Text style={[styles.canhotoText, { marginTop: 8 }]}>
                    ____________________________________________
                  </Text>
                </View>
              </View>
            </View>
            <View style={styles.canhotoRight}>
              <Text style={[styles.fieldLabel, styles.textCenter]}>NF-e</Text>
              <Text style={[styles.bigNumero, { marginTop: 4 }]}>
                Nº {fmtNumeroNfe(nfe.numero)}
              </Text>
              <Text style={[styles.danfeBadge, { marginTop: 4 }]}>
                SÉRIE {String(nfe.serie).padStart(3, '0')}
              </Text>
            </View>
          </View>
        )}
        <View style={styles.dashedLine} />

        {/* ===== Quadro 1: Emitente + DANFE + Chave ===== */}
        <View style={styles.box}>
          <View style={styles.row}>
            {/* Emitente (esquerda) */}
            <View
              style={[
                styles.colBorderRight,
                styles.field,
                { width: '40%', minHeight: 110 },
              ]}
            >
              <Text style={styles.emitNome}>{emitente.razaoSocial}</Text>
              {emitente.nomeFantasia ? (
                <Text style={styles.emitLine}>{emitente.nomeFantasia}</Text>
              ) : null}
              <Text style={[styles.emitLine, { marginTop: 4 }]}>
                {emitente.logradouro}, {emitente.numero}
                {emitente.complemento ? ` - ${emitente.complemento}` : ''}
              </Text>
              <Text style={styles.emitLine}>
                {emitente.bairro} - {emitente.municipio} / {emitente.uf}
              </Text>
              <Text style={styles.emitLine}>CEP {formatCep(emitente.cep)}</Text>
              {emitente.telefone ? (
                <Text style={styles.emitLine}>Fone: {emitente.telefone}</Text>
              ) : null}
              {emitente.email ? (
                <Text style={styles.emitLine}>{emitente.email}</Text>
              ) : null}
            </View>

            {/* DANFE + Chave + Protocolo (centro) */}
            <View
              style={[
                styles.colBorderRight,
                { width: '35%', padding: 4, alignItems: 'center' },
              ]}
            >
              <Text style={styles.danfeTitle}>DANFE</Text>
              <Text style={styles.danfeSubtitle}>
                Documento Auxiliar da Nota Fiscal Eletrônica
              </Text>
              <Text style={styles.danfeBadge}>
                {TIPO_OPERACAO_LABEL[nfe.tipoOperacao] ?? nfe.tipoOperacao}
              </Text>
              <Text style={{ fontSize: 7, marginTop: 4 }}>
                Nº <Text style={styles.bold}>{fmtNumeroNfe(nfe.numero)}</Text>
              </Text>
              <Text style={{ fontSize: 7 }}>
                Série <Text style={styles.bold}>{String(nfe.serie).padStart(3, '0')}</Text>
              </Text>
              <Text style={{ fontSize: 6, color: COLORS.labelText }}>FOLHA 1/1</Text>
              <Image src={barcodeUri} style={styles.barcode} />
              <Text style={styles.chaveLabel}>CHAVE DE ACESSO</Text>
              <Text style={styles.chaveValue}>{formatChaveAcesso(chave)}</Text>
              <Text style={[styles.fieldLabel, { marginTop: 4 }]}>
                Consulta em www.nfe.fazenda.gov.br/portal
              </Text>
            </View>

            {/* Natureza + Inscrições + QR (direita) */}
            <View style={{ width: '25%' }}>
              <View style={[styles.colBorderBottom, styles.field]}>
                <Text style={styles.fieldLabel}>NATUREZA DA OPERAÇÃO</Text>
                <Text style={styles.fieldValue}>{nfe.naturezaOperacao}</Text>
              </View>
              <View style={[styles.colBorderBottom, styles.row]}>
                <View style={[styles.colBorderRight, styles.field, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>PROTOCOLO DE AUTORIZAÇÃO</Text>
                  <Text style={styles.fieldValue}>
                    {nfe.protocoloAutorizacao ?? '—'}
                  </Text>
                  <Text style={styles.fieldLabel}>
                    {nfe.dhAutorizacao
                      ? fmtDateTime(new Date(nfe.dhAutorizacao))
                      : ''}
                  </Text>
                </View>
              </View>
              <View style={[styles.colBorderBottom, styles.field]}>
                <Text style={styles.fieldLabel}>INSCRIÇÃO ESTADUAL</Text>
                <Text style={styles.fieldValue}>{emitente.ie ?? '—'}</Text>
              </View>
              <View style={[styles.colBorderBottom, styles.field]}>
                <Text style={styles.fieldLabel}>INSCR. ESTADUAL DO SUBST. TRIB.</Text>
                <Text style={styles.fieldValue}>—</Text>
              </View>
              <View style={[styles.field, styles.row]}>
                <View style={[styles.colBorderRight, { flex: 1, padding: 2 }]}>
                  <Text style={styles.fieldLabel}>CNPJ</Text>
                  <Text style={styles.fieldValue}>{formatCnpj(emitente.cnpj)}</Text>
                </View>
                {qrUri ? (
                  <View style={{ width: 70, alignItems: 'center' }}>
                    <Image src={qrUri} style={styles.qrcode} />
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        </View>

        {/* ===== Quadro 2: Destinatário/Remetente ===== */}
        {destinatario && (
          <View style={[styles.box, { marginTop: 3 }]}>
            <Text style={styles.quadroTitle}>DESTINATÁRIO / REMETENTE</Text>
            {/* Linha 1: Nome, CNPJ/CPF, Data Emissão */}
            <View style={styles.colBorderBottom}>
              <View style={styles.row}>
                <View style={[styles.colBorderRight, styles.field, { flex: 4 }]}>
                  <Text style={styles.fieldLabel}>NOME / RAZÃO SOCIAL</Text>
                  <Text style={styles.fieldValue}>{destinatario.nomeRazao}</Text>
                </View>
                <View style={[styles.colBorderRight, styles.field, { flex: 2 }]}>
                  <Text style={styles.fieldLabel}>CNPJ / CPF</Text>
                  <Text style={styles.fieldValue}>
                    {formatCnpjCpf(destinatario.cnpjCpf)}
                  </Text>
                </View>
                <View style={[styles.field, { flex: 2 }]}>
                  <Text style={styles.fieldLabel}>DATA DA EMISSÃO</Text>
                  <Text style={styles.fieldValue}>{fmtDate(dhEmissao)}</Text>
                </View>
              </View>
            </View>
            {/* Linha 2: Endereço, Bairro, CEP, Data Saída */}
            <View style={styles.colBorderBottom}>
              <View style={styles.row}>
                <View style={[styles.colBorderRight, styles.field, { flex: 4 }]}>
                  <Text style={styles.fieldLabel}>ENDEREÇO</Text>
                  <Text style={styles.fieldValue}>
                    {destinatario.logradouro}, {destinatario.numero}
                    {destinatario.complemento ? ` - ${destinatario.complemento}` : ''}
                  </Text>
                </View>
                <View style={[styles.colBorderRight, styles.field, { flex: 2 }]}>
                  <Text style={styles.fieldLabel}>BAIRRO / DISTRITO</Text>
                  <Text style={styles.fieldValue}>{destinatario.bairro}</Text>
                </View>
                <View style={[styles.colBorderRight, styles.field, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>CEP</Text>
                  <Text style={styles.fieldValue}>{formatCep(destinatario.cep)}</Text>
                </View>
                <View style={[styles.field, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>DATA SAÍDA/ENTRADA</Text>
                  <Text style={styles.fieldValue}>
                    {dhSaiEnt ? fmtDate(dhSaiEnt) : '—'}
                  </Text>
                </View>
              </View>
            </View>
            {/* Linha 3: Município, Fone, UF, IE, Hora Saída */}
            <View style={styles.row}>
              <View style={[styles.colBorderRight, styles.field, { flex: 3 }]}>
                <Text style={styles.fieldLabel}>MUNICÍPIO</Text>
                <Text style={styles.fieldValue}>{destinatario.municipio}</Text>
              </View>
              <View style={[styles.colBorderRight, styles.field, { flex: 2 }]}>
                <Text style={styles.fieldLabel}>FONE / FAX</Text>
                <Text style={styles.fieldValue}>{destinatario.telefone ?? '—'}</Text>
              </View>
              <View style={[styles.colBorderRight, styles.field, { flex: 1 }]}>
                <Text style={styles.fieldLabel}>UF</Text>
                <Text style={styles.fieldValue}>{destinatario.uf}</Text>
              </View>
              <View style={[styles.colBorderRight, styles.field, { flex: 2 }]}>
                <Text style={styles.fieldLabel}>INSCRIÇÃO ESTADUAL</Text>
                <Text style={styles.fieldValue}>
                  {destinatario.ie
                    ? destinatario.ie
                    : destinatario.indicadorIE === 'NAO_CONTRIBUINTE'
                      ? 'NÃO CONTRIBUINTE'
                      : 'ISENTO'}
                </Text>
              </View>
              <View style={[styles.field, { flex: 1 }]}>
                <Text style={styles.fieldLabel}>HORA SAÍDA</Text>
                <Text style={styles.fieldValue}>
                  {dhSaiEnt ? fmtTime(dhSaiEnt) : '—'}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* ===== Quadro 3: Cálculo do Imposto ===== */}
        <View style={[styles.box, { marginTop: 3 }]}>
          <Text style={styles.quadroTitle}>CÁLCULO DO IMPOSTO</Text>
          {/* Linha 1: ICMS / ICMS-ST / Produtos */}
          <View style={[styles.colBorderBottom, styles.row]}>
            <ImpostoCell label="BASE CÁLC. ICMS" value={nfe.baseIcms} />
            <ImpostoCell label="VALOR DO ICMS" value={nfe.valorIcms} />
            <ImpostoCell label="BASE CÁLC. ICMS-ST" value={nfe.baseIcmsST} />
            <ImpostoCell label="VALOR ICMS-ST" value={nfe.valorIcmsST} />
            <ImpostoCell
              label="VALOR TOTAL DOS PRODUTOS"
              value={nfe.valorProdutos}
              last
            />
          </View>
          {/* Linha 2: Frete / Seguro / Desc / Outras / IPI / Total */}
          <View style={styles.row}>
            <ImpostoCell label="VALOR DO FRETE" value={nfe.valorFrete} />
            <ImpostoCell label="VALOR DO SEGURO" value={nfe.valorSeguro} />
            <ImpostoCell label="DESCONTO" value={nfe.valorDesconto} />
            <ImpostoCell label="OUTRAS DESP." value={nfe.valorOutros} />
            <ImpostoCell label="VALOR DO IPI" value={nfe.valorIpi} />
            <ImpostoCell label="VALOR TOTAL DA NF" value={nfe.valorTotal} highlight last />
          </View>
        </View>

        {/* ===== Quadro 4: Reforma (IBS/CBS/IS) — só renderiza se houver valor ===== */}
        {(Number(nfe.valorIbs) > 0 ||
          Number(nfe.valorCbs) > 0 ||
          Number(nfe.valorIs) > 0 ||
          Number(nfe.baseIbsCbs) > 0) && (
          <View style={[styles.box, { marginTop: 3 }]}>
            <Text style={styles.quadroTitle}>
              REFORMA TRIBUTÁRIA (IBS/CBS/IS — RT 2025.002)
            </Text>
            <View style={styles.row}>
              <ImpostoCell label="BASE IBS/CBS" value={nfe.baseIbsCbs} />
              <ImpostoCell label="VALOR IBS" value={nfe.valorIbs} />
              <ImpostoCell label="VALOR CBS" value={nfe.valorCbs} />
              <ImpostoCell label="VALOR IS" value={nfe.valorIs} last />
            </View>
          </View>
        )}

        {/* ===== Quadro 5: Transportador / Volumes ===== */}
        <View style={[styles.box, { marginTop: 3 }]}>
          <Text style={styles.quadroTitle}>TRANSPORTADOR / VOLUMES TRANSPORTADOS</Text>
          <View style={[styles.colBorderBottom, styles.row]}>
            <View style={[styles.colBorderRight, styles.field, { flex: 3 }]}>
              <Text style={styles.fieldLabel}>NOME / RAZÃO SOCIAL</Text>
              <Text style={styles.fieldValue}>—</Text>
            </View>
            <View style={[styles.colBorderRight, styles.field, { flex: 2 }]}>
              <Text style={styles.fieldLabel}>FRETE POR CONTA</Text>
              <Text style={styles.fieldValue}>
                {MOD_FRETE_LABEL['9']}
              </Text>
            </View>
            <View style={[styles.colBorderRight, styles.field, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>CÓDIGO ANTT</Text>
              <Text style={styles.fieldValue}>—</Text>
            </View>
            <View style={[styles.colBorderRight, styles.field, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>PLACA</Text>
              <Text style={styles.fieldValue}>—</Text>
            </View>
            <View style={[styles.colBorderRight, styles.field, { flex: 0.5 }]}>
              <Text style={styles.fieldLabel}>UF</Text>
              <Text style={styles.fieldValue}>—</Text>
            </View>
            <View style={[styles.field, { flex: 1.5 }]}>
              <Text style={styles.fieldLabel}>CNPJ / CPF</Text>
              <Text style={styles.fieldValue}>—</Text>
            </View>
          </View>
          <View style={[styles.colBorderBottom, styles.row]}>
            <View style={[styles.colBorderRight, styles.field, { flex: 4 }]}>
              <Text style={styles.fieldLabel}>ENDEREÇO</Text>
              <Text style={styles.fieldValue}>—</Text>
            </View>
            <View style={[styles.colBorderRight, styles.field, { flex: 2 }]}>
              <Text style={styles.fieldLabel}>MUNICÍPIO</Text>
              <Text style={styles.fieldValue}>—</Text>
            </View>
            <View style={[styles.colBorderRight, styles.field, { flex: 0.5 }]}>
              <Text style={styles.fieldLabel}>UF</Text>
              <Text style={styles.fieldValue}>—</Text>
            </View>
            <View style={[styles.field, { flex: 2 }]}>
              <Text style={styles.fieldLabel}>INSCRIÇÃO ESTADUAL</Text>
              <Text style={styles.fieldValue}>—</Text>
            </View>
          </View>
          <View style={styles.row}>
            <View style={[styles.colBorderRight, styles.field, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>QUANTIDADE</Text>
              <Text style={styles.fieldValue}>—</Text>
            </View>
            <View style={[styles.colBorderRight, styles.field, { flex: 2 }]}>
              <Text style={styles.fieldLabel}>ESPÉCIE</Text>
              <Text style={styles.fieldValue}>—</Text>
            </View>
            <View style={[styles.colBorderRight, styles.field, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>MARCA</Text>
              <Text style={styles.fieldValue}>—</Text>
            </View>
            <View style={[styles.colBorderRight, styles.field, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>NUMERAÇÃO</Text>
              <Text style={styles.fieldValue}>—</Text>
            </View>
            <View style={[styles.colBorderRight, styles.field, { flex: 1.5 }]}>
              <Text style={styles.fieldLabel}>PESO BRUTO</Text>
              <Text style={styles.fieldValue}>—</Text>
            </View>
            <View style={[styles.field, { flex: 1.5 }]}>
              <Text style={styles.fieldLabel}>PESO LÍQUIDO</Text>
              <Text style={styles.fieldValue}>—</Text>
            </View>
          </View>
        </View>

        {/* ===== Quadro 6: Dados dos Produtos / Serviços ===== */}
        <View style={[styles.box, { marginTop: 3 }]}>
          <Text style={styles.quadroTitle}>DADOS DOS PRODUTOS / SERVIÇOS</Text>
          <View style={styles.itemsHeaderRow}>
            <Text style={[styles.itemsHeaderCell, { width: `${ITEM_COLS.codigo}%` }]}>
              CÓDIGO
            </Text>
            <Text
              style={[styles.itemsHeaderCell, { width: `${ITEM_COLS.descricao}%` }]}
            >
              DESCRIÇÃO
            </Text>
            <Text style={[styles.itemsHeaderCell, { width: `${ITEM_COLS.ncm}%` }]}>
              NCM/SH
            </Text>
            <Text style={[styles.itemsHeaderCell, { width: `${ITEM_COLS.cst}%` }]}>
              CST
            </Text>
            <Text style={[styles.itemsHeaderCell, { width: `${ITEM_COLS.cfop}%` }]}>
              CFOP
            </Text>
            <Text style={[styles.itemsHeaderCell, { width: `${ITEM_COLS.un}%` }]}>
              UN
            </Text>
            <Text
              style={[
                styles.itemsHeaderCell,
                { width: `${ITEM_COLS.qtd}%` },
                styles.textRight,
              ]}
            >
              QUANT
            </Text>
            <Text
              style={[
                styles.itemsHeaderCell,
                { width: `${ITEM_COLS.vUnit}%` },
                styles.textRight,
              ]}
            >
              VLR UNIT
            </Text>
            <Text
              style={[
                styles.itemsHeaderCell,
                { width: `${ITEM_COLS.vTotal}%` },
                styles.textRight,
              ]}
            >
              VLR TOTAL
            </Text>
            <Text
              style={[
                styles.itemsHeaderCell,
                { width: `${ITEM_COLS.bcIcms}%` },
                styles.textRight,
              ]}
            >
              B.CÁLC ICMS
            </Text>
            <Text
              style={[
                styles.itemsHeaderCell,
                { width: `${ITEM_COLS.vIcms}%` },
                styles.textRight,
              ]}
            >
              V.ICMS
            </Text>
            <Text
              style={[
                styles.itemsHeaderCell,
                { width: `${ITEM_COLS.vIpi}%` },
                styles.textRight,
              ]}
            >
              V.IPI
            </Text>
            <Text
              style={[
                styles.itemsHeaderCell,
                { width: `${ITEM_COLS.pIcms}%` },
                styles.textRight,
              ]}
            >
              %ICMS
            </Text>
            <Text
              style={[
                styles.itemsHeaderCell,
                { width: `${ITEM_COLS.pIpi}%` },
                styles.textRight,
              ]}
            >
              %IPI
            </Text>
          </View>
          {nfe.items.map((it) => (
            <View key={it.id} style={styles.itemRow}>
              <Text style={[styles.itemCell, { width: `${ITEM_COLS.codigo}%` }]}>
                {it.codigo}
              </Text>
              <Text style={[styles.itemCell, { width: `${ITEM_COLS.descricao}%` }]}>
                {it.descricao}
              </Text>
              <Text style={[styles.itemCell, { width: `${ITEM_COLS.ncm}%` }]}>
                {it.ncm}
              </Text>
              <Text style={[styles.itemCell, { width: `${ITEM_COLS.cst}%` }]}>
                {formatCstCsosn(it)}
              </Text>
              <Text style={[styles.itemCell, { width: `${ITEM_COLS.cfop}%` }]}>
                {it.cfop}
              </Text>
              <Text style={[styles.itemCell, { width: `${ITEM_COLS.un}%` }]}>
                {it.unidadeComercial}
              </Text>
              <Text
                style={[
                  styles.itemCell,
                  { width: `${ITEM_COLS.qtd}%` },
                  styles.textRight,
                ]}
              >
                {formatDecimal(it.quantidadeComercial, 4)}
              </Text>
              <Text
                style={[
                  styles.itemCell,
                  { width: `${ITEM_COLS.vUnit}%` },
                  styles.textRight,
                ]}
              >
                {formatDecimal(it.valorUnitario, 4)}
              </Text>
              <Text
                style={[
                  styles.itemCell,
                  { width: `${ITEM_COLS.vTotal}%` },
                  styles.textRight,
                ]}
              >
                {formatDecimal(it.valorTotal)}
              </Text>
              <Text
                style={[
                  styles.itemCell,
                  { width: `${ITEM_COLS.bcIcms}%` },
                  styles.textRight,
                ]}
              >
                {it.baseIcms ? formatDecimal(it.baseIcms) : '—'}
              </Text>
              <Text
                style={[
                  styles.itemCell,
                  { width: `${ITEM_COLS.vIcms}%` },
                  styles.textRight,
                ]}
              >
                {it.valorIcms ? formatDecimal(it.valorIcms) : '—'}
              </Text>
              <Text
                style={[
                  styles.itemCell,
                  { width: `${ITEM_COLS.vIpi}%` },
                  styles.textRight,
                ]}
              >
                {it.valorIpi ? formatDecimal(it.valorIpi) : '—'}
              </Text>
              <Text
                style={[
                  styles.itemCell,
                  { width: `${ITEM_COLS.pIcms}%` },
                  styles.textRight,
                ]}
              >
                {it.aliqIcms ? formatPercent(it.aliqIcms) : '—'}
              </Text>
              <Text
                style={[
                  styles.itemCell,
                  { width: `${ITEM_COLS.pIpi}%` },
                  styles.textRight,
                ]}
              >
                {it.aliqIpi ? formatPercent(it.aliqIpi) : '—'}
              </Text>
            </View>
          ))}
        </View>

        {/* ===== Quadro 7: Dados Adicionais ===== */}
        <View style={[styles.box, { marginTop: 3 }]}>
          <Text style={styles.quadroTitle}>DADOS ADICIONAIS</Text>
          <View style={styles.row}>
            <View
              style={[
                styles.colBorderRight,
                styles.field,
                { flex: 2, minHeight: 40 },
              ]}
            >
              <Text style={styles.fieldLabel}>INFORMAÇÕES COMPLEMENTARES</Text>
              <Text style={styles.fieldValue}>{nfe.infCpl ?? ''}</Text>
            </View>
            <View style={[styles.field, { flex: 1, minHeight: 40 }]}>
              <Text style={styles.fieldLabel}>RESERVADO AO FISCO</Text>
              <Text style={styles.fieldValue}>{nfe.infAdFisco ?? ''}</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}

/** Célula padrão do quadro Cálculo do Imposto: label + valor monetário. */
function ImpostoCell({
  label,
  value,
  highlight,
  last,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
  last?: boolean;
}): React.ReactElement {
  return (
    <View
      style={[
        styles.field,
        last ? {} : styles.colBorderRight,
        { flex: 1 },
        highlight ? { backgroundColor: COLORS.fiscoBg } : {},
      ]}
    >
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={[styles.fieldValue, highlight ? styles.bold : {}, styles.textRight]}>
        {formatDecimal(value)}
      </Text>
    </View>
  );
}

// ============================================================================
// Helpers de formatação
// ============================================================================

function formatCnpj(cnpj: string): string {
  const digits = (cnpj ?? '').replace(/\D/g, '');
  if (digits.length !== 14) return cnpj;
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function formatCnpjCpf(value: string): string {
  const digits = (value ?? '').replace(/\D/g, '');
  if (digits.length === 14) return formatCnpj(digits);
  if (digits.length === 11) {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }
  return value;
}

function formatCep(cep: string): string {
  const digits = (cep ?? '').replace(/\D/g, '');
  if (digits.length !== 8) return cep;
  return digits.replace(/^(\d{5})(\d{3})$/, '$1-$2');
}

/** Renderiza decimal com 2 (ou n) casas, separador "," — padrão BR fiscal. */
function formatDecimal(value: string | number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined) return '0,00';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Renderiza percentual com 2 casas (sem o símbolo, fica mais compacto na coluna). */
function formatPercent(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '0,00';
  return formatDecimal(value, 2);
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('pt-BR');
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function fmtDateTime(d: Date): string {
  return d.toLocaleString('pt-BR');
}

/** Formata o número da NF-e com 9 dígitos zero-paddados. */
function fmtNumeroNfe(numero: string | number): string {
  return String(numero).padStart(9, '0');
}

/**
 * Coluna CST da tabela de produtos: regime normal usa CST (Origem.CST com 3 dígitos),
 * Simples Nacional usa CSOSN. Origem (1 dígito) precede o CST/CSOSN no formato MOC.
 */
function formatCstCsosn(it: NFeItem): string {
  const origem = it.origemMercadoria ?? 0;
  if (it.csosnIcms) return `${origem}${it.csosnIcms}`;
  if (it.cstIcms) return `${origem}${it.cstIcms.padStart(2, '0')}`;
  return '—';
}
