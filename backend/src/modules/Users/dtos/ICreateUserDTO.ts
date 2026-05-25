export interface ICreateUserDTO {
  tenantId: string;
  email: string;
  fullName: string;
  passwordHash: string;
}
