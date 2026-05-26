import { useMutation } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';

import { lookupCep, lookupCnpj } from '@/features/lookup/lookup-api';
import { ApiError } from '@/lib/api';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Label } from '@/shared/components/ui/Label';
import { Select } from '@/shared/components/ui/Select';
import { Switch } from '@/shared/components/ui/Switch';

import type {
  AmbienteSefaz,
  CodigoRegimeTributario,
  CreateCompanyPayload,
} from './companies-api';

export type CompanyFormState = {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  ie: string;
  im: string;
  crt: CodigoRegimeTributario;
  cnae: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  codigoMunicipioIbge: string;
  municipio: string;
  uf: string;
  cep: string;
  telefone: string;
  email: string;
  ambienteSefaz: AmbienteSefaz;
  emiteNfe: boolean;
  emiteNfse: boolean;
  usaIcms: boolean;
  usaIcmsSt: boolean;
  usaIpi: boolean;
  usaDifal: boolean;
  usaFcp: boolean;
  usaIcmsDesonerado: boolean;
};

export const COMPANY_FORM_INITIAL: CompanyFormState = {
  cnpj: '',
  razaoSocial: '',
  nomeFantasia: '',
  ie: '',
  im: '',
  crt: 'REGIME_NORMAL',
  cnae: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  codigoMunicipioIbge: '',
  municipio: '',
  uf: '',
  cep: '',
  telefone: '',
  email: '',
  ambienteSefaz: 'HOMOLOGACAO',
  emiteNfe: true,
  emiteNfse: false,
  usaIcms: true,
  usaIcmsSt: false,
  usaIpi: false,
  usaDifal: false,
  usaFcp: false,
  usaIcmsDesonerado: false,
};

export function companyFormToPayload(form: CompanyFormState): CreateCompanyPayload {
  return {
    cnpj: form.cnpj.replace(/\D/g, ''),
    razaoSocial: form.razaoSocial,
    nomeFantasia: form.nomeFantasia || null,
    ie: form.ie || null,
    im: form.im || null,
    crt: form.crt,
    cnae: form.cnae || null,
    logradouro: form.logradouro,
    numero: form.numero,
    complemento: form.complemento || null,
    bairro: form.bairro,
    codigoMunicipioIbge: form.codigoMunicipioIbge,
    municipio: form.municipio,
    uf: form.uf.toUpperCase(),
    cep: form.cep.replace(/\D/g, ''),
    telefone: form.telefone || null,
    email: form.email || null,
    ambienteSefaz: form.ambienteSefaz,
    emiteNfe: form.emiteNfe,
    emiteNfse: form.emiteNfse,
    usaIcms: form.usaIcms,
    usaIcmsSt: form.usaIcmsSt,
    usaIpi: form.usaIpi,
    usaDifal: form.usaDifal,
    usaFcp: form.usaFcp,
    usaIcmsDesonerado: form.usaIcmsDesonerado,
  };
}

interface CompanyFormProps {
  form: CompanyFormState;
  setField: <K extends keyof CompanyFormState>(key: K, value: CompanyFormState[K]) => void;
  disabled?: boolean;
  /** No modo de edição, desabilita o CNPJ pra não bagunçar trilha fiscal. */
  cnpjDisabled?: boolean;
}

/**
 * Form de empresa reutilizável (criar/editar). Mantém o pattern do FACILITA-IR:
 * <Label> + <Input> com `space-y-2`, grids 2 colunas pra campos curtos.
 *
 * Autocompletes:
 *  - CNPJ → BrasilAPI (razão, fantasia, CNAE, endereço, telefone, e-mail).
 *  - CEP → ViaCEP (logradouro, bairro, município, UF, código IBGE).
 */
export function CompanyForm({ form, setField, disabled, cnpjDisabled }: CompanyFormProps) {
  const cnpjLookup = useMutation({
    mutationFn: () => lookupCnpj(form.cnpj),
    onSuccess: (result) => {
      if (result.razaoSocial && !form.razaoSocial) setField('razaoSocial', result.razaoSocial);
      if (result.nomeFantasia && !form.nomeFantasia) setField('nomeFantasia', result.nomeFantasia);
      if (result.cnae && !form.cnae) setField('cnae', result.cnae);
      // Endereço
      if (result.endereco.logradouro) setField('logradouro', result.endereco.logradouro);
      if (result.endereco.numero) setField('numero', result.endereco.numero);
      if (result.endereco.complemento) setField('complemento', result.endereco.complemento);
      if (result.endereco.bairro) setField('bairro', result.endereco.bairro);
      if (result.endereco.cep) setField('cep', result.endereco.cep);
      if (result.endereco.uf) setField('uf', result.endereco.uf);
      if (result.endereco.municipio) setField('municipio', result.endereco.municipio);
      if (result.endereco.codigoIbgeMunicipio) {
        setField('codigoMunicipioIbge', result.endereco.codigoIbgeMunicipio);
      }
      if (result.contato.telefone && !form.telefone) setField('telefone', result.contato.telefone);
      if (result.contato.email && !form.email) setField('email', result.contato.email);
      toast.success(`Dados do CNPJ ${result.cnpj} preenchidos automaticamente.`);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Falha ao buscar CNPJ.'),
  });

  const cepLookup = useMutation({
    mutationFn: () => lookupCep(form.cep),
    onSuccess: (result) => {
      if (result.logradouro) setField('logradouro', result.logradouro);
      if (result.complemento) setField('complemento', result.complemento);
      if (result.bairro) setField('bairro', result.bairro);
      if (result.municipio) setField('municipio', result.municipio);
      if (result.uf) setField('uf', result.uf);
      if (result.codigoIbgeMunicipio) setField('codigoMunicipioIbge', result.codigoIbgeMunicipio);
      toast.success(`CEP ${result.cep} preenchido.`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Falha ao buscar CEP.'),
  });

  const cnpjDigits = form.cnpj.replace(/\D/g, '');
  const cepDigits = form.cep.replace(/\D/g, '');
  const cnpjValido = cnpjDigits.length === 14;
  const cepValido = cepDigits.length === 8;

  return (
    <div className="space-y-6">
      {/* Identificação */}
      <Section title="Identificação">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="CNPJ" required>
            <div className="flex gap-2">
              <Input
                required
                maxLength={18}
                placeholder="00.000.000/0000-00"
                value={form.cnpj}
                onChange={(e) => setField('cnpj', e.target.value)}
                disabled={disabled || cnpjDisabled}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => cnpjLookup.mutate()}
                disabled={!cnpjValido || disabled || cnpjLookup.isPending}
                title="Buscar dados na Receita Federal"
              >
                {cnpjLookup.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>
          </Field>
          <Field label="Regime tributário" required>
            <Select
              required
              value={form.crt}
              onChange={(e) => setField('crt', e.target.value as CodigoRegimeTributario)}
              disabled={disabled}
            >
              <option value="SIMPLES_NACIONAL">Simples Nacional</option>
              <option value="SIMPLES_EXCESSO_RECEITA">Simples — excesso de receita</option>
              <option value="REGIME_NORMAL">Regime Normal</option>
              <option value="MEI">MEI</option>
            </Select>
          </Field>
        </div>
        <Field label="Razão social" required>
          <Input
            required
            maxLength={200}
            value={form.razaoSocial}
            onChange={(e) => setField('razaoSocial', e.target.value)}
            disabled={disabled}
          />
        </Field>
        <Field label="Nome fantasia">
          <Input
            maxLength={200}
            value={form.nomeFantasia}
            onChange={(e) => setField('nomeFantasia', e.target.value)}
            disabled={disabled}
          />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Inscrição estadual (IE)">
            <Input
              maxLength={20}
              placeholder="ISENTO ou número"
              value={form.ie}
              onChange={(e) => setField('ie', e.target.value)}
              disabled={disabled}
            />
          </Field>
          <Field label="Inscrição municipal">
            <Input
              maxLength={20}
              value={form.im}
              onChange={(e) => setField('im', e.target.value)}
              disabled={disabled}
            />
          </Field>
          <Field label="CNAE">
            <Input
              maxLength={7}
              placeholder="0000000"
              value={form.cnae}
              onChange={(e) => setField('cnae', e.target.value)}
              disabled={disabled}
            />
          </Field>
        </div>
      </Section>

      {/* Endereço */}
      <Section title="Endereço">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="CEP" required>
            <div className="flex gap-2">
              <Input
                required
                maxLength={9}
                placeholder="00000-000"
                value={form.cep}
                onChange={(e) => setField('cep', e.target.value)}
                disabled={disabled}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => cepLookup.mutate()}
                disabled={!cepValido || disabled || cepLookup.isPending}
                title="Buscar endereço pelo CEP"
              >
                {cepLookup.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>
          </Field>
          <Field label="UF" required>
            <Input
              required
              maxLength={2}
              placeholder="SP"
              value={form.uf}
              onChange={(e) => setField('uf', e.target.value.toUpperCase())}
              disabled={disabled}
            />
          </Field>
          <Field label="Cód. IBGE município" required>
            <Input
              required
              maxLength={7}
              placeholder="3550308"
              value={form.codigoMunicipioIbge}
              onChange={(e) => setField('codigoMunicipioIbge', e.target.value)}
              disabled={disabled}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Município" required>
            <Input
              required
              maxLength={100}
              value={form.municipio}
              onChange={(e) => setField('municipio', e.target.value)}
              disabled={disabled}
            />
          </Field>
          <Field label="Bairro" required>
            <Input
              required
              maxLength={100}
              value={form.bairro}
              onChange={(e) => setField('bairro', e.target.value)}
              disabled={disabled}
            />
          </Field>
        </div>
        <Field label="Logradouro" required>
          <Input
            required
            maxLength={200}
            value={form.logradouro}
            onChange={(e) => setField('logradouro', e.target.value)}
            disabled={disabled}
          />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Número" required>
            <Input
              required
              maxLength={20}
              value={form.numero}
              onChange={(e) => setField('numero', e.target.value)}
              disabled={disabled}
            />
          </Field>
          <Field label="Complemento">
            <Input
              maxLength={100}
              value={form.complemento}
              onChange={(e) => setField('complemento', e.target.value)}
              disabled={disabled}
            />
          </Field>
        </div>
      </Section>

      {/* Contato */}
      <Section title="Contato">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Telefone">
            <Input
              maxLength={20}
              value={form.telefone}
              onChange={(e) => setField('telefone', e.target.value)}
              disabled={disabled}
            />
          </Field>
          <Field label="E-mail">
            <Input
              type="email"
              maxLength={150}
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              disabled={disabled}
            />
          </Field>
        </div>
      </Section>

      {/* Ambiente fiscal */}
      <Section
        title="Ambiente fiscal"
        description="Comece em homologação. Mude para produção só após validar o ciclo completo."
      >
        <Field label="Ambiente SEFAZ" required>
          <Select
            required
            value={form.ambienteSefaz}
            onChange={(e) => setField('ambienteSefaz', e.target.value as AmbienteSefaz)}
            disabled={disabled}
          >
            <option value="HOMOLOGACAO">Homologação</option>
            <option value="PRODUCAO">Produção</option>
          </Select>
        </Field>
        <ToggleRow
          label="Emite NF-e modelo 55"
          description="Habilita o ciclo de emissão direto na SEFAZ."
          checked={form.emiteNfe}
          onChange={(v) => setField('emiteNfe', v)}
          disabled={disabled}
        />
        <ToggleRow
          label="Emite NFS-e"
          description="Roteado via Focus NF-e (nacional ou municipal)."
          checked={form.emiteNfse}
          onChange={(v) => setField('emiteNfse', v)}
          disabled={disabled}
        />
      </Section>

      {/* Flags tributárias */}
      <Section
        title="Flags tributárias"
        description="Cada flag corresponde a um grupo do XML. Habilite só as que se aplicam à operação."
      >
        <ToggleRow label="ICMS" description="Cálculo de ICMS próprio." checked={form.usaIcms} onChange={(v) => setField('usaIcms', v)} disabled={disabled} />
        <ToggleRow label="ICMS-ST" description="Substituição Tributária (autopeças, bebidas, etc.)." checked={form.usaIcmsSt} onChange={(v) => setField('usaIcmsSt', v)} disabled={disabled} />
        <ToggleRow label="IPI" description="Indústrias e equiparadas." checked={form.usaIpi} onChange={(v) => setField('usaIpi', v)} disabled={disabled} />
        <ToggleRow label="DIFAL" description="Diferencial de alíquotas em operações interestaduais B2C." checked={form.usaDifal} onChange={(v) => setField('usaDifal', v)} disabled={disabled} />
        <ToggleRow label="FCP" description="Fundo de Combate à Pobreza da UF de destino." checked={form.usaFcp} onChange={(v) => setField('usaFcp', v)} disabled={disabled} />
        <ToggleRow label="ICMS desonerado" description="Para regimes com isenção/redução com desoneração." checked={form.usaIcmsDesonerado} onChange={(v) => setField('usaIcmsDesonerado', v)} disabled={disabled} />
      </Section>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div className="space-y-0.5">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
