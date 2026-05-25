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
 * Componente React-PDF que renderiza o DANFE. Layout SIMPLIFICADO (MVP) — cobre os
 * blocos obrigatórios conforme MOC NF-e item 4 mas sem refinamentos visuais que cabem
 * em uma iteração dedicada com revisão fiscal:
 *  - Cabeçalho com emitente + chave + código de barras Code-128 + protocolo
 *  - Dados do destinatário
 *  - Dados gerais da NF-e (natureza, número, série, ambiente)
 *  - Tabela de itens (10 colunas)
 *  - Totais (regime antigo + Reforma)
 *  - Dados adicionais (observações + informações ao fisco)
 *
 * Em produção, o layout final deve ser revisado por especialista fiscal/contábil para
 * garantir aderência total ao MOC (especialmente proporções, tarjas, ordem de campos).
 */

const styles = StyleSheet.create({
  page: {
    paddingTop: 18,
    paddingBottom: 18,
    paddingHorizontal: 16,
    fontSize: 8,
    fontFamily: 'Helvetica',
  },
  hr: { height: 1, backgroundColor: '#000', marginVertical: 4 },
  section: { borderWidth: 1, borderColor: '#000', marginBottom: 4 },
  sectionTitle: {
    fontSize: 6,
    color: '#444',
    fontWeight: 'bold',
    marginBottom: 1,
  },
  row: { flexDirection: 'row' },
  col: { paddingHorizontal: 4, paddingVertical: 2, borderRightWidth: 1, borderRightColor: '#000' },
  colLast: { paddingHorizontal: 4, paddingVertical: 2 },
  label: { fontSize: 6, color: '#555' },
  value: { fontSize: 9, marginTop: 1 },
  bigValue: { fontSize: 12, fontWeight: 'bold' },
  chaveBlock: {
    borderWidth: 1,
    borderColor: '#000',
    padding: 6,
    alignItems: 'center',
  },
  barcode: { width: 380, height: 32, marginVertical: 2 },
  itemsHeader: {
    flexDirection: 'row',
    backgroundColor: '#e0e0e0',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    paddingVertical: 2,
  },
  itemsCol: { paddingHorizontal: 2, fontSize: 6, color: '#222', fontWeight: 'bold' },
  itemRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#999',
    paddingVertical: 1,
  },
  itemCell: { paddingHorizontal: 2, fontSize: 7 },
  tarja: {
    backgroundColor: '#ffeb3b',
    color: '#000',
    padding: 4,
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 6,
  },
  totaisLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderTopColor: '#000',
    paddingTop: 4,
  },
  totaisItem: {
    width: '20%',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
});

const COL_WIDTHS = {
  codigo: '8%',
  descricao: '30%',
  ncm: '8%',
  cfop: '6%',
  un: '6%',
  qtd: '8%',
  vUnit: '10%',
  vTotal: '10%',
  pIcms: '7%',
  vIcms: '7%',
};

export interface DanfeProps {
  nfe: NFe & { items: NFeItem[] };
  emitente: Company;
  destinatario: Customer | null;
  barcodePng: Buffer;
  qrCodePng?: Buffer;
}

export function DanfeDocument({ nfe, emitente, destinatario, barcodePng, qrCodePng }: DanfeProps): React.ReactElement {
  const isHomologacao = nfe.ambiente === AmbienteSefaz.HOMOLOGACAO;
  const chave = nfe.chaveAcesso ?? '';
  const barcodeUri = `data:image/png;base64,${barcodePng.toString('base64')}`;
  const qrUri = qrCodePng ? `data:image/png;base64,${qrCodePng.toString('base64')}` : null;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {isHomologacao && (
          <View style={styles.tarja}>
            <Text>SEM VALOR FISCAL — AMBIENTE DE HOMOLOGAÇÃO</Text>
          </View>
        )}

        {/* === Cabeçalho: emitente, chave, código de barras === */}
        <View style={styles.section}>
          <View style={styles.row}>
            <View style={{ ...styles.col, width: '50%' }}>
              <Text style={styles.bigValue}>{emitente.razaoSocial}</Text>
              {emitente.nomeFantasia ? (
                <Text style={styles.value}>{emitente.nomeFantasia}</Text>
              ) : null}
              <Text style={styles.value}>
                {emitente.logradouro}, {emitente.numero}
                {emitente.complemento ? ` - ${emitente.complemento}` : ''}
              </Text>
              <Text style={styles.value}>
                {emitente.bairro} - {emitente.municipio} / {emitente.uf} - CEP {emitente.cep}
              </Text>
              <Text style={styles.value}>
                CNPJ: {formatCnpj(emitente.cnpj)}    IE: {emitente.ie ?? '—'}
              </Text>
            </View>
            <View style={{ ...styles.col, width: '20%' }}>
              <Text style={styles.label}>DANFE</Text>
              <Text style={styles.bigValue}>
                Documento Auxiliar da Nota Fiscal Eletrônica
              </Text>
              <Text style={styles.value}>
                {nfe.tipoOperacao === 'ENTRADA' ? '0 - ENTRADA' : '1 - SAÍDA'}
              </Text>
              <Text style={styles.value}>Nº {String(nfe.numero).padStart(9, '0')}</Text>
              <Text style={styles.value}>Série {String(nfe.serie).padStart(3, '0')}</Text>
            </View>
            <View style={{ ...styles.colLast, width: '30%', alignItems: 'center' }}>
              {qrUri ? <Image src={qrUri} style={{ width: 90, height: 90 }} /> : null}
              <Text style={styles.label}>Consulta de autenticidade no portal da NF-e</Text>
            </View>
          </View>
        </View>

        {/* === Chave de acesso + protocolo === */}
        <View style={styles.chaveBlock}>
          <Text style={styles.label}>Chave de acesso</Text>
          <Image src={barcodeUri} style={styles.barcode} />
          <Text style={{ fontSize: 9, letterSpacing: 1 }}>{formatChaveAcesso(chave)}</Text>
          <View style={{ ...styles.row, marginTop: 4 }}>
            <Text style={styles.label}>
              Protocolo: {nfe.protocoloAutorizacao ?? '—'}    Data autorização:{' '}
              {nfe.dhAutorizacao
                ? new Date(nfe.dhAutorizacao).toLocaleString('pt-BR')
                : '—'}
            </Text>
          </View>
        </View>

        {/* === Dados gerais === */}
        <View style={styles.section}>
          <View style={styles.row}>
            <View style={{ ...styles.col, width: '50%' }}>
              <Text style={styles.label}>NATUREZA DA OPERAÇÃO</Text>
              <Text style={styles.value}>{nfe.naturezaOperacao}</Text>
            </View>
            <View style={{ ...styles.col, width: '25%' }}>
              <Text style={styles.label}>FINALIDADE</Text>
              <Text style={styles.value}>{nfe.finalidade}</Text>
            </View>
            <View style={{ ...styles.colLast, width: '25%' }}>
              <Text style={styles.label}>EMISSÃO</Text>
              <Text style={styles.value}>
                {new Date(nfe.dhEmissao).toLocaleString('pt-BR')}
              </Text>
            </View>
          </View>
        </View>

        {/* === Destinatário === */}
        {destinatario ? (
          <View style={styles.section}>
            <View style={styles.row}>
              <View style={{ ...styles.col, width: '60%' }}>
                <Text style={styles.label}>DESTINATÁRIO / REMETENTE</Text>
                <Text style={styles.value}>{destinatario.nomeRazao}</Text>
                <Text style={styles.value}>
                  CNPJ/CPF: {formatCnpjCpf(destinatario.cnpjCpf)}    IE:{' '}
                  {destinatario.ie ?? 'ISENTO'}
                </Text>
              </View>
              <View style={{ ...styles.colLast, width: '40%' }}>
                <Text style={styles.label}>ENDEREÇO</Text>
                <Text style={styles.value}>
                  {destinatario.logradouro}, {destinatario.numero}
                </Text>
                <Text style={styles.value}>
                  {destinatario.bairro} - {destinatario.municipio}/{destinatario.uf} - CEP{' '}
                  {destinatario.cep}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* === Tabela de itens === */}
        <View style={styles.section}>
          <View style={styles.itemsHeader}>
            <Text style={{ ...styles.itemsCol, width: COL_WIDTHS.codigo }}>Código</Text>
            <Text style={{ ...styles.itemsCol, width: COL_WIDTHS.descricao }}>Descrição</Text>
            <Text style={{ ...styles.itemsCol, width: COL_WIDTHS.ncm }}>NCM</Text>
            <Text style={{ ...styles.itemsCol, width: COL_WIDTHS.cfop }}>CFOP</Text>
            <Text style={{ ...styles.itemsCol, width: COL_WIDTHS.un }}>Un</Text>
            <Text style={{ ...styles.itemsCol, width: COL_WIDTHS.qtd, textAlign: 'right' }}>Qtd</Text>
            <Text style={{ ...styles.itemsCol, width: COL_WIDTHS.vUnit, textAlign: 'right' }}>V. Unit.</Text>
            <Text style={{ ...styles.itemsCol, width: COL_WIDTHS.vTotal, textAlign: 'right' }}>V. Total</Text>
            <Text style={{ ...styles.itemsCol, width: COL_WIDTHS.pIcms, textAlign: 'right' }}>%ICMS</Text>
            <Text style={{ ...styles.itemsCol, width: COL_WIDTHS.vIcms, textAlign: 'right' }}>V. ICMS</Text>
          </View>
          {nfe.items.map((it) => (
            <View key={it.id} style={styles.itemRow}>
              <Text style={{ ...styles.itemCell, width: COL_WIDTHS.codigo }}>{it.codigo}</Text>
              <Text style={{ ...styles.itemCell, width: COL_WIDTHS.descricao }}>{it.descricao}</Text>
              <Text style={{ ...styles.itemCell, width: COL_WIDTHS.ncm }}>{it.ncm}</Text>
              <Text style={{ ...styles.itemCell, width: COL_WIDTHS.cfop }}>{it.cfop}</Text>
              <Text style={{ ...styles.itemCell, width: COL_WIDTHS.un }}>{it.unidadeComercial}</Text>
              <Text style={{ ...styles.itemCell, width: COL_WIDTHS.qtd, textAlign: 'right' }}>{it.quantidadeComercial}</Text>
              <Text style={{ ...styles.itemCell, width: COL_WIDTHS.vUnit, textAlign: 'right' }}>{it.valorUnitario}</Text>
              <Text style={{ ...styles.itemCell, width: COL_WIDTHS.vTotal, textAlign: 'right' }}>{it.valorTotal}</Text>
              <Text style={{ ...styles.itemCell, width: COL_WIDTHS.pIcms, textAlign: 'right' }}>{it.aliqIcms ?? '—'}</Text>
              <Text style={{ ...styles.itemCell, width: COL_WIDTHS.vIcms, textAlign: 'right' }}>{it.valorIcms ?? '—'}</Text>
            </View>
          ))}
        </View>

        {/* === Totais === */}
        <View style={styles.section}>
          <View style={styles.totaisLine}>
            <View style={styles.totaisItem}>
              <Text style={styles.label}>BASE ICMS</Text>
              <Text style={styles.value}>{nfe.baseIcms}</Text>
            </View>
            <View style={styles.totaisItem}>
              <Text style={styles.label}>VALOR ICMS</Text>
              <Text style={styles.value}>{nfe.valorIcms}</Text>
            </View>
            <View style={styles.totaisItem}>
              <Text style={styles.label}>VALOR IPI</Text>
              <Text style={styles.value}>{nfe.valorIpi}</Text>
            </View>
            <View style={styles.totaisItem}>
              <Text style={styles.label}>VALOR FRETE</Text>
              <Text style={styles.value}>{nfe.valorFrete}</Text>
            </View>
            <View style={styles.totaisItem}>
              <Text style={styles.label}>VALOR PRODUTOS</Text>
              <Text style={styles.value}>{nfe.valorProdutos}</Text>
            </View>
            <View style={styles.totaisItem}>
              <Text style={styles.label}>VALOR IBS</Text>
              <Text style={styles.value}>{nfe.valorIbs}</Text>
            </View>
            <View style={styles.totaisItem}>
              <Text style={styles.label}>VALOR CBS</Text>
              <Text style={styles.value}>{nfe.valorCbs}</Text>
            </View>
            <View style={styles.totaisItem}>
              <Text style={styles.label}>VALOR IS</Text>
              <Text style={styles.value}>{nfe.valorIs}</Text>
            </View>
            <View style={styles.totaisItem}>
              <Text style={{ ...styles.label, fontWeight: 'bold' }}>VALOR TOTAL DA NF</Text>
              <Text style={{ ...styles.bigValue }}>R$ {nfe.valorTotal}</Text>
            </View>
          </View>
        </View>

        {/* === Informações adicionais === */}
        {(nfe.infCpl || nfe.infAdFisco) && (
          <View style={styles.section}>
            <View style={{ padding: 4 }}>
              {nfe.infCpl ? (
                <>
                  <Text style={styles.label}>INFORMAÇÕES COMPLEMENTARES</Text>
                  <Text style={styles.value}>{nfe.infCpl}</Text>
                </>
              ) : null}
              {nfe.infAdFisco ? (
                <>
                  <Text style={{ ...styles.label, marginTop: 4 }}>RESERVADO AO FISCO</Text>
                  <Text style={styles.value}>{nfe.infAdFisco}</Text>
                </>
              ) : null}
            </View>
          </View>
        )}
      </Page>
    </Document>
  );
}

function formatCnpj(cnpj: string): string {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return cnpj;
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function formatCnpjCpf(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 14) return formatCnpj(digits);
  if (digits.length === 11) {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }
  return value;
}
