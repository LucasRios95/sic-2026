import { readFileSync } from 'node:fs';
import https from 'node:https';

import axios, { AxiosInstance } from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { inject, injectable } from 'tsyringe';

import { AmbienteSefaz } from '@modules/Companies/infra/typeorm/entities/Company';
import { IntegrationError } from '@shared/errors';
import { logger } from '@shared/logger';
import { CertificateAccessor } from '@shared/container/providers/CertificateVault/CertificateAccessor';
import { RetrievedCertificate } from '@shared/container/providers/CertificateVault/ICertificateVault';

import { NFeSigner } from '../signing/NFeSigner';
import {
  ISefazTransmissionRepository,
} from '../../repositories/ISefazTransmissionRepository';
import { SefazEndpoints, SefazService } from './SefazEndpoints';

export interface SoapCallParams {
  companyId: string;
  uf: string;
  ambiente: AmbienteSefaz;
  service: SefazService;
  /** XML do corpo do SOAP (já com namespaces oficiais). */
  bodyXml: string;
  /** vaultRef do certificado A1 a usar para mTLS. */
  certificateVaultRef: string;
  /** ID da NF-e/Evento para correlação no SefazTransmission (opcional). */
  nfeId?: string;
  /** Modo contingência SVC. */
  contingenciaSvc?: boolean;
  /** Timeout (ms). Default 30s. */
  timeoutMs?: number;
}

export interface SoapCallResult {
  cStat?: string;
  xMotivo?: string;
  responseXml: string;
  durationMs: number;
  httpStatus: number;
  endpointUrl: string;
}

/**
 * Cliente SOAP da SEFAZ. Responsabilidades:
 *  - Recuperar o certificado do cofre (uma vez por transmissão).
 *  - Estabelecer conexão HTTPS com mTLS (certificado do cliente).
 *  - Enviar o envelope SOAP 1.2 com o body informado.
 *  - Persistir a transmissão (request + response + duração + cStat) no SefazTransmission.
 *  - Retornar o XML de resposta cru + extração mínima (cStat/xMotivo).
 *
 * NÃO é responsabilidade desta classe:
 *  - Compor o XML específico do serviço (isso fica em use cases dedicados).
 *  - Decidir retentativas finais (BullMQ cuida — esta classe só faz retry transitório).
 *  - Validar XSD do XML enviado (TSK-100 — pendência documentada).
 *
 * Padrão de retry:
 *  - Erros 5xx ou network → 1 retry após 2s (mitigação de blip transitório).
 *  - Erros 4xx ou retornos cStat com rejeição → SEM retry (são erros de negócio).
 */
@injectable()
export class SefazSoapClient {
  private readonly xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@',
    removeNSPrefix: true,
  });

  constructor(
    @inject(CertificateAccessor)
    private readonly certAccessor: CertificateAccessor,

    @inject('SefazTransmissionRepository')
    private readonly transmissionRepo: ISefazTransmissionRepository,
  ) {}

  async call(params: SoapCallParams): Promise<SoapCallResult> {
    // params.certificateVaultRef pode ser tanto um vault_ref interno (`fs:...`)
    // quanto um Certificate.id público vindo da request — accessor faz a resolução.
    const cert = await this.certAccessor.retrieve(params.companyId, params.certificateVaultRef);
    const { url, autorizadora } = SefazEndpoints.url(
      params.uf,
      params.ambiente,
      params.service,
      { contingenciaSvc: params.contingenciaSvc },
    );

    const envelope = this.wrapInSoapEnvelope(params.bodyXml, params.service);
    const httpsAgent = this.buildHttpsAgent(cert, params.ambiente);
    const httpClient = this.buildHttpClient(httpsAgent, params.timeoutMs ?? 30_000);

    const startedAt = Date.now();
    let httpStatus = 0;
    let responseXml = '';
    let cStat: string | undefined;
    let xMotivo: string | undefined;
    let errorMessage: string | undefined;

    try {
      const response = await this.callWithSingleRetry(httpClient, url, envelope, params.service);
      httpStatus = response.status;
      responseXml = response.data;
      ({ cStat, xMotivo } = this.extractStatus(responseXml));
    } catch (err) {
      const axiosErr = err as { response?: { status: number; data: string }; message: string };
      httpStatus = axiosErr.response?.status ?? 0;
      responseXml = axiosErr.response?.data ?? '';
      errorMessage = axiosErr.message;
      logger.warn({ url, err: errorMessage }, 'Falha de comunicação com SEFAZ');
      throw new IntegrationError(
        `Falha ao comunicar com SEFAZ ${autorizadora}: ${errorMessage}`,
        'SEFAZ_COMMUNICATION_FAILURE',
        { httpStatus, url },
      );
    } finally {
      const durationMs = Date.now() - startedAt;
      // Persistência da transmissão é best-effort: nunca falhar a operação por isso.
      try {
        await this.transmissionRepo.create({
          companyId: params.companyId,
          nfeId: params.nfeId ?? null,
          uf: params.uf,
          ambiente: params.ambiente,
          servico: params.service,
          requestXml: envelope,
          responseXml,
          httpStatus,
          cStat: cStat ?? null,
          durationMs,
          errorMessage: errorMessage ?? null,
        });
      } catch (saveErr) {
        logger.warn({ err: saveErr }, 'Falha ao persistir SefazTransmission');
      }
    }

    return {
      cStat,
      xMotivo,
      responseXml,
      durationMs: Date.now() - startedAt,
      httpStatus,
      endpointUrl: url,
    };
  }

  /**
   * Envelope SOAP 1.2 padrão da NF-e. O nome do serviço determina o namespace
   * dentro do `nfeDadosMsg`. Em alguns serviços a tag wrapper é diferente — esta
   * versão usa `nfeDadosMsg` que cobre Status, Autorização e Consulta.
   */
  private wrapInSoapEnvelope(bodyXml: string, service: SefazService): string {
    const action = `http://www.portalfiscal.inf.br/nfe/wsdl/${service}`;
    return [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">',
      '<soap12:Body>',
      `<nfeDadosMsg xmlns="${action}">${bodyXml}</nfeDadosMsg>`,
      '</soap12:Body>',
      '</soap12:Envelope>',
    ].join('');
  }

  private buildHttpsAgent(
    cert: RetrievedCertificate,
    ambiente: AmbienteSefaz,
  ): https.Agent {
    // mTLS: o cliente apresenta seu certificado (extraído do PFX) à SEFAZ.
    const { privateKeyPem, certificatePem } = NFeSigner.extractPemFromPkcs12(
      cert.content,
      cert.password,
    );

    // SEFAZ usa cadeia ICP-Brasil que NÃO vem no trust store padrão do Node. Política:
    //  1) Se `NFE_TLS_CA_BUNDLE` apontar para um arquivo PEM com as ACs ICP-Brasil,
    //     usamos validação estrita com esse bundle — caminho recomendado para produção.
    //     Como obter: baixe o bundle público (ITI/Serpro disponibilizam) e monte
    //     o arquivo no container em `/app/certs/icp-brasil.pem` ou similar.
    //  2) Sem bundle e em HOMOLOGAÇÃO: relaxamos `rejectUnauthorized` — ambiente
    //     de testes é isolado e os certs do SEFAZ-HOM mudam frequentemente.
    //  3) Sem bundle e em PRODUÇÃO: log explícito e fallback para os roots do Node.
    //     Algumas autorizadoras já usam certs com cadeia incluída em DigiCert/Sectigo,
    //     então pode funcionar; mas o caminho oficial é fornecer o bundle ICP.
    const isHomologacao = ambiente === AmbienteSefaz.HOMOLOGACAO;
    const ca = this.loadCaBundle();

    let rejectUnauthorized: boolean;
    if (ca) {
      rejectUnauthorized = true;
    } else if (isHomologacao) {
      logger.warn(
        'mTLS em HOMOLOGAÇÃO com rejectUnauthorized=false. Configure NFE_TLS_CA_BUNDLE para validação estrita.',
      );
      rejectUnauthorized = false;
    } else {
      logger.warn(
        'NFE_TLS_CA_BUNDLE não definido em PRODUÇÃO — usando trust store padrão do Node. Cadeia ICP-Brasil pode não validar; configure o bundle para garantir.',
      );
      rejectUnauthorized = true;
    }

    return new https.Agent({
      cert: certificatePem,
      key: privateKeyPem,
      ca: ca ?? undefined,
      rejectUnauthorized,
      // TLS 1.2 mínimo (SEFAZ não aceita TLS < 1.2; várias autorizadoras já só TLS 1.3).
      minVersion: 'TLSv1.2',
    });
  }

  // Cache do bundle PEM — leitura de disco a cada request seria desnecessária.
  private static cachedCaBundle: string | null | undefined;

  private loadCaBundle(): string | null {
    if (SefazSoapClient.cachedCaBundle !== undefined) {
      return SefazSoapClient.cachedCaBundle;
    }
    const path = process.env.NFE_TLS_CA_BUNDLE;
    if (!path) {
      SefazSoapClient.cachedCaBundle = null;
      return null;
    }
    try {
      const content = readFileSync(path, 'utf8');
      logger.info({ path, bytes: content.length }, 'Bundle ICP-Brasil carregado para mTLS SEFAZ');
      SefazSoapClient.cachedCaBundle = content;
      return content;
    } catch (err) {
      logger.error(
        { path, err: (err as Error).message },
        'Falha ao ler NFE_TLS_CA_BUNDLE — caindo no trust store padrão',
      );
      SefazSoapClient.cachedCaBundle = null;
      return null;
    }
  }

  private buildHttpClient(httpsAgent: https.Agent, timeoutMs: number): AxiosInstance {
    return axios.create({
      timeout: timeoutMs,
      httpsAgent,
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
      },
      // SEFAZ frequentemente devolve XML mesmo em status HTTP 500 — capturamos o body
      // sempre, em vez de deixar axios lançar antes de ler.
      validateStatus: () => true,
      // Resposta como string para preservar a representação exata do XML (crucial para
      // re-canonicalizar caso queiramos verificar assinatura de resposta).
      transformResponse: [(d) => d],
    });
  }

  private async callWithSingleRetry(
    client: AxiosInstance,
    url: string,
    envelope: string,
    service: SefazService,
  ): Promise<{ status: number; data: string }> {
    const tryCall = async () =>
      client.post<string>(url, envelope, {
        headers: { SOAPAction: `http://www.portalfiscal.inf.br/nfe/wsdl/${service}` },
      });

    try {
      const r = await tryCall();
      if (r.status >= 500) throw new Error(`HTTP ${r.status}`);
      return { status: r.status, data: r.data };
    } catch (err) {
      // 1 retry após 2s — cobre blip transitório sem mascarar erro persistente.
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      const r = await tryCall();
      return { status: r.status, data: r.data };
    }
  }

  /**
   * Extrai `cStat` e `xMotivo` do XML de resposta. A SEFAZ usa esses dois campos em
   * praticamente todas as respostas (status servico, autorização, evento), e são o
   * sinal primário se a chamada foi bem-sucedida.
   *
   * Em respostas de autorização (`retEnviNFe`), o envelope traz DOIS pares cStat/xMotivo:
   *   1. No nível do lote (ex.: 104 "Lote processado") — só diz que o lote foi recebido.
   *   2. Dentro de `protNFe/infProt` — o status REAL da NF-e (100 autorizada, 225 rejeição
   *      de schema, etc.). É esse que precisa virar `nfes.c_stat`/`xMotivo`.
   *
   * A busca prefere o `infProt` (mais interno e específico) e cai pra busca recursiva
   * só quando ele não existe (ex.: respostas de Status Serviço).
   */
  private extractStatus(xml: string): { cStat?: string; xMotivo?: string } {
    if (!xml) return {};
    try {
      const parsed = this.xmlParser.parse(xml) as Record<string, unknown>;
      const infProt = this.findFirstByKey(parsed, 'infProt');
      if (infProt && typeof infProt === 'object') {
        const o = infProt as Record<string, unknown>;
        if (o.cStat !== undefined || o.xMotivo !== undefined) {
          return {
            cStat: o.cStat !== undefined ? String(o.cStat) : undefined,
            xMotivo: o.xMotivo !== undefined ? String(o.xMotivo) : undefined,
          };
        }
      }
      const findRecursive = (obj: unknown): { cStat?: string; xMotivo?: string } => {
        if (!obj || typeof obj !== 'object') return {};
        const o = obj as Record<string, unknown>;
        if (o.cStat !== undefined || o.xMotivo !== undefined) {
          return {
            cStat: o.cStat !== undefined ? String(o.cStat) : undefined,
            xMotivo: o.xMotivo !== undefined ? String(o.xMotivo) : undefined,
          };
        }
        for (const value of Object.values(o)) {
          const found = findRecursive(value);
          if (found.cStat || found.xMotivo) return found;
        }
        return {};
      };
      return findRecursive(parsed);
    } catch {
      return {};
    }
  }

  /** Procura recursivamente a primeira ocorrência de uma chave no objeto parseado. */
  private findFirstByKey(obj: unknown, key: string): unknown {
    if (!obj || typeof obj !== 'object') return undefined;
    const o = obj as Record<string, unknown>;
    if (o[key] !== undefined) return o[key];
    for (const value of Object.values(o)) {
      const found = this.findFirstByKey(value, key);
      if (found !== undefined) return found;
    }
    return undefined;
  }
}
