import { Repository } from 'typeorm';

import { appDataSource } from '@shared/infra/typeorm/data-source';

import { ICreateUserDTO } from '../../../dtos/ICreateUserDTO';
import { IUserRepository } from '../../../repositories/IUserRepository';
import { User } from '../entities/User';

export class UserRepository implements IUserRepository {
  private readonly repo: Repository<User>;

  constructor() {
    this.repo = appDataSource.getRepository(User);
  }

  async create(data: ICreateUserDTO): Promise<User> {
    const user = this.repo.create(data);
    return this.repo.save(user);
  }

  async findById(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.repo.findOne({ where: { email } });
  }

  async listByTenant(tenantId: string): Promise<User[]> {
    return this.repo.find({ where: { tenantId }, order: { fullName: 'ASC' } });
  }

  async save(user: User): Promise<User> {
    return this.repo.save(user);
  }
}
