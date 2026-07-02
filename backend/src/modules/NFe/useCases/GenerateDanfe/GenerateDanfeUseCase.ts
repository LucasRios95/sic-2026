import { renderToBuffer } from '@react-pdf/renderer';
import { XMLParser } from 'fast-xml-parser';
import React from 'react';
import { inject, injectable } from 'tsyringe';

import { ICompanyRepository } from '@modules/Companies/repositories/ICompanyRepository';
import { ICustomerRepository } from '@modules/Customers/repositories/ICustomerRepository';
import { IDocumentStorage } from '@shared/container/providers/DocumentStorage/IDocumentStorage';
import { BusinessRuleError, NotFoundError } from '@shared/errors';

import { DocumentStatus } from '../../domain/nfe-enums';
import { renderChaveAcessoBarcode, renderConsultaQrCode } from '../../infra/pdf/barcode';
import { DanfeDocument, type DanfeTransporte } from '../../infra/pdf/DanfeDocument';
import { NFe } from '../../infra/typeorm/entities/NFe';
import { NFeItem } from '../../infra/typeorm/entities/NFeItem';
import { INFeRepository } from '../../repositories/INFeRepository';

interface IRequest {
  companyId: string;
  nfeId: string;
  /** Quando true, força regeneração mesmo se já existe no storage. */
  force?: boolean;
}

interface IResponse {
  storageKey: string;
  signedUrl: string;
  bytes: number;
  regenerated: boolean;
}

/**
 * Gera o DANFE (PDF) a partir de uma NF-e autorizada. Idempotente: se o PDF já existe
 * no storage e a NF-e não mudou, devolve a URL existente sem re-renderizar.
 *
 * Pré-condições:
 *  - NF-e em status AUTHORIZED (DANFE de DRAFT/REJECTED não faz sentido).
 *  - `chaveAcesso` preenchida.
 *
 * Layout: ver DanfeDocument.tsx — versão MVP que cobre todos os blocos obrigatórios
 * mas pede revisão visual antes de uso real. Documento marcado com tarja amarela
 * "SEM VALOR FISCAL" quando emitido em homologação.
 */
@injectable()
export class GenerateDanfeUseCase {
  constructor(
    @inject('NFeRepository')
    private readonly nfeRepository: INFeRepository,

    @inject('CompanyRepository')
    private readonly companyRepository: ICompanyRepository,

    @inject('CustomerRepository')
    private readonly customerRepository: ICustomerRepository,

    @inject('DocumentStorage')
    private readonly storage: IDocumentStorage,
  ) {}

  async execute(request: IRequest): Promise<IResponse> {
    const nfe = await this.nfeRepository.findByIdWithRelations(
      request.companyId,
      request.nfeId,
    );
    if (!nfe) throw new NotFoundError('NF-e não encontrada');
    if (nfe.status !== DocumentStatus.AUTHORIZED) {
      throw new BusinessRuleError(
        `DANFE exige NF-e AUTHORIZED. Status atual: ${nfe.status}`,
        'DANFE_REQUIRES_AUTHORIZED',
      );
    }
    if (!nfe.chaveAcesso) {
      throw new BusinessRuleError(
        'NF-e sem chave de acesso — não é possível gerar DANFE',
        'NFE_MISSING_CHAVE',
      );
    }

    const storageKey = this.buildKey(nfe);

    if (!request.force && (await this.storage.exists(storageKey))) {
      const signedUrl = await this.storage.getSignedUrl(storageKey, 15 * 60);
      const existing = await this.storage.get(storageKey);
      return {
        storageKey,
        signedUrl,
        bytes: existing?.length ?? 0,
        regenerated: false,
      };
    }

    const company = await this.companyRepository.findById(request.companyId);
    if (!company) throw new NotFoundError('Empresa não encontrada');
    const customer = nfe.customerId
      ? await this.customerRepository.findById(request.companyId, nfe.customerId)
      : null;

    const barcodePng = await renderChaveAcessoBarcode(nfe.chaveAcesso);
    const qrCodePng = await renderConsultaQrCode(nfe.chaveAcesso);

    // @react-pdf/renderer espera ReactElement. Como o tipo NFe aqui já carrega items,
    // usamos cast para o shape esperado pelo componente.
    // modFrete/indFinal não são colunas da NFe — extraímos do XML (fonte da verdade),
    // com fallback no cadastro do destinatário para o indicador de consumidor final.
    const xmlFonte = nfe.xmlAutorizado ?? nfe.xmlAssinado;
    const modalidadeFrete = extractModFrete(xmlFonte);
    const indFinalXml = extractIndFinal(xmlFonte);
    const consumidorFinal = indFinalXml ?? customer?.consumidorFinal ?? false;
    const transporte = extractTransporte(xmlFonte);

    const pdfBuffer = await renderToBuffer(
      React.createElement(DanfeDocument, {
        nfe: nfe as NFe & { items: NFeItem[] },
        emitente: company,
        destinatario: customer,
        barcodePng,
        qrCodePng,
        modalidadeFrete,
        consumidorFinal,
        transporte,
      }),
    );

    await this.storage.put(storageKey, pdfBuffer, 'application/pdf');
    const signedUrl = await this.storage.getSignedUrl(storageKey, 15 * 60);

    // Atualiza danfeUrl para a key (não a URL assinada, que tem TTL) — outros lugares
    // pedem signedUrl novo quando precisar acessar.
    await this.nfeRepository.update(nfe.id, { danfeUrl: storageKey });

    return { storageKey, signedUrl, bytes: pdfBuffer.length, regenerated: true };
  }

  private buildKey(nfe: NFe): string {
    const year = new Date(nfe.dhEmissao).getUTCFullYear();
    const month = String(new Date(nfe.dhEmissao).getUTCMonth() + 1).padStart(2, '0');
    return `nfe/${nfe.companyId}/${year}/${month}/${nfe.chaveAcesso}.pdf`;
  }
}

/** Extrai o modFrete (0-4, 9) do XML da NF-e. Retorna undefined se não achar. */
function extractModFrete(xml: string | null | undefined): number | undefined {
  if (!xml) return undefined;
  const match = xml.match(/<modFrete>\s*(\d)\s*<\/modFrete>/);
  return match ? Number(match[1]) : undefined;
}

/** Extrai o indFinal (0=normal, 1=consumidor final) do XML. undefined se não achar. */
function extractIndFinal(xml: string | null | undefined): boolean | undefined {
  if (!xml) return undefined;
  const match = xml.match(/<indFinal>\s*(\d)\s*<\/indFinal>/);
  return match ? match[1] === '1' : undefined;
}

const transpXmlParser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false,
});

/** Extrai o bloco de transporte (transportadora, veículo, volumes) do XML da NF-e. */
function extractTransporte(xml: string | null | undefined): DanfeTransporte | undefined {
  if (!xml) return undefined;
  try {
    const parsed = transpXmlParser.parse(xml) as Record<string, unknown>;
    const transp = asRec(findDeep(parsed, 'transp'));
    if (!transp) return undefined;

    const ta = asRec(transp.transporta);
    const ve = asRec(transp.veicTransp);
    const volRaw = transp.vol;
    const vols = Array.isArray(volRaw) ? volRaw : volRaw ? [volRaw] : [];

    return {
      transportadora: ta
        ? {
            cnpjCpf: s(ta.CNPJ) ?? s(ta.CPF),
            nome: s(ta.xNome),
            ie: s(ta.IE),
            endereco: s(ta.xEnder),
            municipio: s(ta.xMun),
            uf: s(ta.UF),
          }
        : null,
      veiculo: ve
        ? { placa: s(ve.placa), uf: s(ve.UF), rntc: s(ve.RNTC) }
        : null,
      volumes: vols.map((v) => {
        const vol = asRec(v) ?? {};
        return {
          quantidade: s(vol.qVol),
          especie: s(vol.esp),
          marca: s(vol.marca),
          numeracao: s(vol.nVol),
          pesoLiquido: s(vol.pesoL),
          pesoBruto: s(vol.pesoB),
        };
      }),
    };
  } catch {
    return undefined;
  }
}

function asRec(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function s(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

function findDeep(obj: unknown, key: string): unknown {
  if (!obj || typeof obj !== 'object') return null;
  const rec = obj as Record<string, unknown>;
  if (key in rec) return rec[key];
  for (const v of Object.values(rec)) {
    const found = findDeep(v, key);
    if (found !== null && found !== undefined) return found;
  }
  return null;
}
