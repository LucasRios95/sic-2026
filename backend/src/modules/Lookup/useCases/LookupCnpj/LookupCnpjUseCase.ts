import axios, { AxiosError } from 'axios';
import { injectable } from 'tsyringe';

import { BusinessRuleError, IntegrationError, NotFoundError } from '@shared/errors';
import { logger } from '@shared/logger';

export interface CnpjLookupResult {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  situacaoCadastral: string;
  dataAbertura: string | null;
  cnae: string | null;
  cnaeDescricao: string | null;
  naturezaJuridica: string | null;
  porte: string | null;
  capitalSocial: string | null;
  endereco: {
    logradouro: string;
    numero: string;
    complemento: string | null;
    bairro: string;
    municipio: string;
    uf: string;
    cep: string;
    codigoIbgeMunicipio: string | null;
  };
  contato: {
    telefone: string | null;
    email: string | null;
  };
  /** Fonte de dados que respondeu (útil pra debug). */
  source: 'brasilapi' | 'receitaws';
}

interface BrasilApiCnpjResponse {
  cnpj: string;
  razao_social?: string;
  nome_fantasia?: string;
  situacao_cadastral?: number | string;
  descricao_situacao_cadastral?: string;
  data_inicio_atividade?: string;
  cnae_fiscal?: number | string;
  cnae_fiscal_descricao?: string;
  codigo_natureza_juridica?: number | string;
  natureza_juridica?: string;
  porte?: string;
  capital_social?: number;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  codigo_municipio_ibge?: number | string;
  ddd_telefone_1?: string;
  email?: string;
}

interface ReceitaWsResponse {
  status?: string; // "OK" ou "ERROR"
  message?: string;
  cnpj?: string;
  nome?: string;
  fantasia?: string;
  abertura?: string;
  situacao?: string;
  natureza_juridica?: string;
  porte?: string;
  capital_social?: string;
  atividade_principal?: { code: string; text: string }[];
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  telefone?: string;
  email?: string;
}

/**
 * Lookup de CNPJ com cadeia de fontes:
 *   1) BrasilAPI (https://brasilapi.com.br) — dados ricos (inclui código IBGE), free.
 *   2) ReceitaWS (https://receitaws.com.br) — fallback quando BrasilAPI está fora ou
 *      retorna 429/5xx. Não traz código IBGE, mas o suficiente pra autocompletar form.
 *
 * Cache em memória LRU (TTL 1h) — dados cadastrais mudam pouco em horizonte curto.
 *
 * BrasilAPI tem rate limit estrito (~3 req/min no endpoint /cnpj). Em caso de
 * 429/5xx/timeout, fallback automático no ReceitaWS evita "API indisponível" no
 * usuário final em 95% dos casos.
 */
@injectable()
export class LookupCnpjUseCase {
  private static readonly TTL_MS = 60 * 60 * 1000;
  private static readonly MAX_ENTRIES = 2000;
  private static readonly UPSTREAM_TIMEOUT_MS = 10_000;
  private cache = new Map<string, { value: CnpjLookupResult; expiresAt: number }>();

  async execute(cnpjRaw: string): Promise<CnpjLookupResult> {
    const cnpj = cnpjRaw.replace(/\D/g, '');
    if (!/^\d{14}$/.test(cnpj)) {
      throw new BusinessRuleError('CNPJ deve ter 14 dígitos', 'INVALID_CNPJ');
    }

    const cached = this.cache.get(cnpj);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    // 1ª tentativa: BrasilAPI.
    let brasilApiError: AxiosError | null = null;
    try {
      const result = await this.fetchBrasilApi(cnpj);
      this.put(cnpj, result);
      return result;
    } catch (err) {
      const axiosErr = err as AxiosError;
      // 404 é determinístico — não vale tentar outra fonte.
      if (axiosErr.response?.status === 404) {
        throw new NotFoundError(`CNPJ ${cnpj} não encontrado na Receita Federal`);
      }
      brasilApiError = axiosErr;
      logger.warn(
        {
          cnpj,
          status: axiosErr.response?.status,
          code: axiosErr.code,
          msg: axiosErr.message,
        },
        'BrasilAPI falhou — tentando fallback ReceitaWS',
      );
    }

    // 2ª tentativa: ReceitaWS.
    try {
      const result = await this.fetchReceitaWs(cnpj);
      this.put(cnpj, result);
      return result;
    } catch (err) {
      const axiosErr = err as AxiosError;
      if (axiosErr.response?.status === 404) {
        throw new NotFoundError(`CNPJ ${cnpj} não encontrado na Receita Federal`);
      }
      logger.error(
        {
          cnpj,
          brasilApiStatus: brasilApiError?.response?.status,
          brasilApiCode: brasilApiError?.code,
          receitaWsStatus: axiosErr.response?.status,
          receitaWsCode: axiosErr.code,
        },
        'Ambas as fontes de CNPJ falharam',
      );
      throw new IntegrationError(
        'Serviço de busca de CNPJ indisponível no momento. Tente novamente em alguns segundos ou preencha manualmente.',
        'CNPJ_UPSTREAM_UNAVAILABLE',
        {
          brasilApiStatus: brasilApiError?.response?.status ?? brasilApiError?.code,
          receitaWsStatus: axiosErr.response?.status ?? axiosErr.code,
        },
      );
    }
  }

  private async fetchBrasilApi(cnpj: string): Promise<CnpjLookupResult> {
    const { data } = await axios.get<BrasilApiCnpjResponse>(
      `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
      { timeout: LookupCnpjUseCase.UPSTREAM_TIMEOUT_MS },
    );
    return {
      cnpj,
      razaoSocial: data.razao_social ?? '',
      nomeFantasia: data.nome_fantasia || null,
      situacaoCadastral:
        data.descricao_situacao_cadastral ?? String(data.situacao_cadastral ?? ''),
      dataAbertura: data.data_inicio_atividade ?? null,
      cnae: data.cnae_fiscal ? String(data.cnae_fiscal).padStart(7, '0') : null,
      cnaeDescricao: data.cnae_fiscal_descricao ?? null,
      naturezaJuridica: data.natureza_juridica ?? null,
      porte: data.porte ?? null,
      capitalSocial: data.capital_social ? String(data.capital_social) : null,
      endereco: {
        logradouro: data.logradouro ?? '',
        numero: data.numero ?? '',
        complemento: data.complemento || null,
        bairro: data.bairro ?? '',
        municipio: data.municipio ?? '',
        uf: data.uf ?? '',
        cep: (data.cep ?? '').replace(/\D/g, ''),
        codigoIbgeMunicipio: data.codigo_municipio_ibge
          ? String(data.codigo_municipio_ibge)
          : null,
      },
      contato: {
        telefone: data.ddd_telefone_1 || null,
        email: data.email || null,
      },
      source: 'brasilapi',
    };
  }

  private async fetchReceitaWs(cnpj: string): Promise<CnpjLookupResult> {
    const { data } = await axios.get<ReceitaWsResponse>(
      `https://receitaws.com.br/v1/cnpj/${cnpj}`,
      {
        timeout: LookupCnpjUseCase.UPSTREAM_TIMEOUT_MS,
        headers: { Accept: 'application/json' },
      },
    );
    // ReceitaWS devolve 200 com {status: "ERROR", message: "..."} pra CNPJ inexistente
    // ou rate-limit. Tratamos como 404 quando a mensagem indica "não existe".
    if (data.status === 'ERROR') {
      const msg = (data.message ?? '').toLowerCase();
      if (msg.includes('não existe') || msg.includes('not found') || msg.includes('inválido')) {
        throw new NotFoundError(`CNPJ ${cnpj} não encontrado na Receita Federal`);
      }
      // Rate-limit etc — força fluxo de IntegrationError.
      throw Object.assign(new Error(data.message ?? 'ReceitaWS error'), {
        isAxiosError: true,
        response: { status: 429 },
      });
    }
    const cnaePrincipal = data.atividade_principal?.[0];
    const cnaeCode = cnaePrincipal?.code?.replace(/\D/g, '') ?? null;
    return {
      cnpj,
      razaoSocial: data.nome ?? '',
      nomeFantasia: data.fantasia || null,
      situacaoCadastral: data.situacao ?? '',
      dataAbertura: data.abertura ? formatBrToIso(data.abertura) : null,
      cnae: cnaeCode ? cnaeCode.padStart(7, '0') : null,
      cnaeDescricao: cnaePrincipal?.text ?? null,
      naturezaJuridica: data.natureza_juridica ?? null,
      porte: data.porte ?? null,
      capitalSocial: data.capital_social ?? null,
      endereco: {
        logradouro: data.logradouro ?? '',
        numero: data.numero ?? '',
        complemento: data.complemento || null,
        bairro: data.bairro ?? '',
        municipio: data.municipio ?? '',
        uf: data.uf ?? '',
        cep: (data.cep ?? '').replace(/\D/g, ''),
        codigoIbgeMunicipio: null,
      },
      contato: {
        telefone: data.telefone || null,
        email: data.email || null,
      },
      source: 'receitaws',
    };
  }

  private put(key: string, value: CnpjLookupResult): void {
    if (this.cache.size >= LookupCnpjUseCase.MAX_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) this.cache.delete(oldestKey);
    }
    this.cache.set(key, { value, expiresAt: Date.now() + LookupCnpjUseCase.TTL_MS });
  }
}

function formatBrToIso(br: string): string {
  // "01/01/2010" → "2010-01-01"
  const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return br;
  return `${m[3]}-${m[2]}-${m[1]}`;
}
