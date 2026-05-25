/**
 * Storage de documentos gerados (DANFE PDF, XML autorizado, relatórios).
 *
 * Convenções:
 *  - `key`: caminho lógico organizado por empresa/ano/mês/identificador
 *    (ex.: `nfe/01927ab.../2026/06/35260611222333000181550010000000011000000017.pdf`).
 *  - Conteúdo é sempre binário (Buffer).
 *  - URLs assinadas têm TTL — em filesystem, a rota `/storage/:token` serve com token
 *    HMAC; em S3, é a URL pré-assinada do próprio bucket.
 */
export interface StorageObject {
  key: string;
  contentType: string;
  size: number;
}

export interface IDocumentStorage {
  /**
   * Persiste o conteúdo no storage. Sobrescreve se a key já existir — o caller é
   * responsável pela imutabilidade (chave de NF-e + extensão = chave imutável).
   */
  put(key: string, content: Buffer, contentType: string): Promise<StorageObject>;

  get(key: string): Promise<Buffer | null>;

  /** Remove sem erro se não existe (idempotente). */
  remove(key: string): Promise<void>;

  exists(key: string): Promise<boolean>;

  /**
   * URL assinada com TTL em segundos. Em FileSystemStorage, retorna `/storage/{token}`
   * onde o token é HMAC do (key + expiração) — a rota valida na API.
   */
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
}
