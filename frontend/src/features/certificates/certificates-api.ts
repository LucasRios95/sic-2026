import { useAuthStore } from '@/features/auth/auth-store';
import { api } from '@/lib/api';
import type { CertificateView } from '@/shared/types/fiscal';

function companyOrThrow(): string {
  const id = useAuthStore.getState().selectedCompanyId;
  if (!id) throw new Error('Empresa não selecionada');
  return id;
}

export async function listCertificates(): Promise<CertificateView[]> {
  return api<CertificateView[]>('/certificates', {
    companyId: companyOrThrow(),
  });
}

export async function uploadCertificate(payload: {
  pfxBase64: string;
  password: string;
  alias?: string;
}): Promise<{ certificate: CertificateView; expiresInDays: number }> {
  return api<{ certificate: CertificateView; expiresInDays: number }>('/certificates', {
    method: 'POST',
    body: payload,
    companyId: companyOrThrow(),
  });
}

export async function revokeCertificate(id: string): Promise<void> {
  await api<void>(`/certificates/${id}`, {
    method: 'DELETE',
    companyId: companyOrThrow(),
  });
}

/**
 * Converte File de input[type=file] para base64 puro (sem o prefixo `data:...,`).
 * O backend recebe assim e decodifica para Buffer.
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      // dataURL: "data:application/octet-stream;base64,XXXXX"
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
