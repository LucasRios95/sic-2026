import { ICreateUserDTO } from '../dtos/ICreateUserDTO';
import { User } from '../infra/typeorm/entities/User';

export interface IUserRepository {
  create(data: ICreateUserDTO): Promise<User>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  listByTenant(tenantId: string): Promise<User[]>;
  save(user: User): Promise<User>;
}
