import { BeforeInsert, CreateDateColumn, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';

/**
 * Superclasse para entidades que querem id UUID v7 + timestamps automáticos.
 * UUID v7 é monotonicamente crescente (timestamp ms no prefixo), o que melhora
 * a performance de inserção em índices B-tree comparado a UUID v4.
 */
export abstract class BaseEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @BeforeInsert()
  ensureId(): void {
    if (!this.id) this.id = uuidv7();
  }
}
