import { compare, hash } from 'bcryptjs';

import { authConfig } from '@config/auth';

import { IHashProvider } from '../IHashProvider';

export class BcryptHashProvider implements IHashProvider {
  async generateHash(plain: string): Promise<string> {
    return hash(plain, authConfig.password.bcryptCost);
  }

  async compareHash(plain: string, hashed: string): Promise<boolean> {
    return compare(plain, hashed);
  }
}
