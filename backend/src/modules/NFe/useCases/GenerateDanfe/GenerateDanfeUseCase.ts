import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import { inject, injectable } from 'tsyringe';

import { ICompanyRepository } from '@modules/Companies/repositories/ICompanyRepository';
import { ICustomerRepository } from '@modules/Customers/repositories/ICustomerRepository';
import { IDocumentStorage } from '@shared/container/providers/DocumentStorage/IDocumentStorage';
import { BusinessRuleError, NotFoundError } from '@shared/errors';

import { DocumentStatus } from '../../domain/nfe-enums';
import { renderChaveAcessoBarcode, renderConsultaQrCode } from '../../infra/pdf/barcode';
import { DanfeDocument } from '../../infra/pdf/DanfeDocument';
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
    const pdfBuffer = await renderToBuffer(
      React.createElement(DanfeDocument, {
        nfe: nfe as NFe & { items: NFeItem[] },
        emitente: company,
        destinatario: customer,
        barcodePng,
        qrCodePng,
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
