import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  fileToBase64,
  listCertificates,
  revokeCertificate,
  uploadCertificate,
} from '@/features/certificates/certificates-api';
import { ApiError } from '@/lib/api';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/Card';
import { Input } from '@/shared/components/ui/Input';
import { Label } from '@/shared/components/ui/Label';
import { Modal } from '@/shared/components/ui/Modal';

export function CertificatesPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const { data: certificates, isLoading } = useQuery({
    queryKey: ['certificates'],
    queryFn: listCertificates,
  });

  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [alias, setAlias] = useState('');
  const [error, setError] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Selecione o arquivo PFX');
      const pfxBase64 = await fileToBase64(file);
      return uploadCertificate({
        pfxBase64,
        password,
        alias: alias || undefined,
      });
    },
    onSuccess: () => {
      setFile(null);
      setPassword('');
      setAlias('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['certificates'] });
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Falha ao subir o certificado.');
    },
  });

  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const revokeMutation = useMutation({
    mutationFn: revokeCertificate,
    onSuccess: () => {
      setRevokeTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['certificates'] });
    },
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Certificados Digitais</h1>
        <p className="text-muted-foreground">
          Custódia de e-CNPJ A1 da empresa. Conteúdo do PFX nunca é mostrado — só metadados.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Carregar novo certificado A1</CardTitle>
          <CardDescription>
            O CNPJ do certificado precisa bater com o CNPJ da empresa selecionada. Validade
            é verificada antes de persistir.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="alias">Apelido (opcional)</Label>
            <Input
              id="alias"
              placeholder="Ex.: A1 - Renovação 2026"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pfx">Arquivo PFX</Label>
            <Input
              id="pfx"
              type="file"
              accept=".pfx,.p12"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha do PFX</Label>
            <Input
              id="password"
              type="password"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button
            onClick={() => uploadMutation.mutate()}
            loading={uploadMutation.isPending}
            disabled={!file || !password}
          >
            Carregar certificado
          </Button>
        </CardFooter>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Certificados cadastrados</h2>
        {isLoading ? <p>Carregando…</p> : null}
        {!isLoading && (!certificates || certificates.length === 0) ? (
          <Card>
            <CardContent className="text-muted-foreground">
              Nenhum certificado cadastrado ainda. Sem certificado, a emissão fiscal não
              consegue assinar XML.
            </CardContent>
          </Card>
        ) : null}
        {certificates?.map((cert) => {
          const validTo = new Date(cert.validTo);
          const daysLeft = Math.ceil((validTo.getTime() - Date.now()) / 86_400_000);
          const expiringSoon = daysLeft <= 30;
          return (
            <Card key={cert.id}>
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-base flex items-center gap-2">
                    {cert.alias}
                    {cert.active ? (
                      expiringSoon ? (
                        <Badge className="bg-amber-100 text-amber-800">
                          {daysLeft <= 0 ? 'expirado' : `${daysLeft}d restantes`}
                        </Badge>
                      ) : (
                        <Badge className="bg-green-100 text-green-800">ativo</Badge>
                      )
                    ) : (
                      <Badge className="bg-zinc-200 text-zinc-700">revogado</Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {cert.tipo} · {cert.commonName} · Serial {cert.serialNumber}
                  </CardDescription>
                </div>
                {cert.active ? (
                  <Button variant="destructive" onClick={() => setRevokeTarget(cert.id)}>
                    Revogar
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-1">
                <div>
                  Válido de {new Date(cert.validFrom).toLocaleDateString('pt-BR')} até{' '}
                  {validTo.toLocaleDateString('pt-BR')}
                </div>
                {cert.cnpjTitular ? <div>CNPJ titular: {cert.cnpjTitular}</div> : null}
                <div className="text-xs">Thumbprint: {cert.thumbprint}</div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <Modal
        open={!!revokeTarget}
        title="Revogar certificado"
        description="Ação irreversível. O certificado fica indisponível para emissão e o conteúdo é removido do cofre."
        onClose={() => setRevokeTarget(null)}
        onConfirm={() => revokeTarget && revokeMutation.mutate(revokeTarget)}
        confirmLabel="Revogar"
        destructive
        loading={revokeMutation.isPending}
      >
        <p className="text-sm">
          Confirme que quer revogar este certificado. Em caso de erro, será necessário
          re-uploadar o PFX original.
        </p>
      </Modal>
    </div>
  );
}
