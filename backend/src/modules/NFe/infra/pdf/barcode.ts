import bwipjs from 'bwip-js';

/**
 * Renderiza um código de barras Code-128 com a chave de acesso (44 dígitos) — exigência
 * do DANFE conforme MOC NF-e item 4.1.1. Retorna PNG em Buffer pronto para colocar como
 * imagem no PDF via React-PDF.
 *
 * Code-128 é a simbologia padrão para chave de acesso em NF-e/NFC-e/CT-e. A altura típica
 * é 80px com ratio 2:1 entre barras e espaços.
 */
export async function renderChaveAcessoBarcode(chave: string): Promise<Buffer> {
  if (!/^\d{44}$/.test(chave)) {
    throw new Error('Chave de acesso para código de barras deve ter 44 dígitos');
  }
  return bwipjs.toBuffer({
    bcid: 'code128',
    text: chave,
    scale: 2,
    height: 12, // mm
    includetext: false, // o texto fica abaixo, formatado pelo PDF
    backgroundcolor: 'FFFFFF',
  });
}

/**
 * Renderiza um QR Code com a URL de consulta pública da NF-e na SEFAZ. Não é obrigatório
 * para NF-e modelo 55 (obrigatório só para NFC-e modelo 65), mas é cortês adicionar —
 * destinatário pode escanear e validar a autenticidade sem digitar a chave.
 *
 * URL padrão SEFAZ: https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?tipoConsulta=resumo&tipoConteudo=...
 * Para simplificar (e porque o link real depende da UF), geramos com a URL de consulta
 * por chave — funciona como navegação manual.
 */
export async function renderConsultaQrCode(chave: string): Promise<Buffer> {
  const url = `https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?nfe=${chave}`;
  return bwipjs.toBuffer({
    bcid: 'qrcode',
    text: url,
    scale: 4,
    backgroundcolor: 'FFFFFF',
  });
}

/** Formata chave 44 dígitos como "XXXX XXXX ... XXXX" (11 grupos de 4) para exibição. */
export function formatChaveAcesso(chave: string): string {
  if (!/^\d{44}$/.test(chave)) return chave;
  return chave.match(/.{1,4}/g)!.join(' ');
}
