import { ServiceTaxRule } from '../infra/typeorm/entities/ServiceTaxRule';

export interface CreateServiceTaxRuleData {
  serviceId: string;
  validFrom: Date;
  validTo?: Date | null;
  cstIss?: string | null;
  aliqIss?: string | null;
  tipoRetencao?: ServiceTaxRule['tipoRetencao'];
  cstIbsCbs?: ServiceTaxRule['cstIbsCbs'];
  cClassTrib?: string | null;
  cIndOp?: ServiceTaxRule['cIndOp'];
  cstPis?: string | null;
  cstCofins?: string | null;
  retemPisCofins?: boolean;
  retemCsll?: boolean;
  retemInss?: boolean;
  retemIr?: boolean;
}

export interface IServiceTaxRuleRepository {
  create(data: CreateServiceTaxRuleData): Promise<ServiceTaxRule>;
  listByService(serviceId: string): Promise<ServiceTaxRule[]>;
  findActiveAt(serviceId: string, date: Date): Promise<ServiceTaxRule | null>;
}
