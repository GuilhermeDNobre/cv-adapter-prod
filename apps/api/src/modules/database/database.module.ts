import { Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import type { Pool } from 'pg';
import { DATABASE, DATABASE_POOL, databasePoolProvider, databaseProvider } from './database.provider';

@Module({
  providers: [databasePoolProvider, databaseProvider],
  exports: [DATABASE],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
