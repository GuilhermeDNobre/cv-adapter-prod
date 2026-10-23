import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { deepSeekCredentials } from 'schema';
import { DATABASE, type Database } from '../database/database.provider';

export const DEEPSEEK_KEY_STORE = 'DEEPSEEK_KEY_STORE';

export interface DeepSeekKeyStore {
  findApiKey(): Promise<string | null>;
  saveApiKey(apiKey: string): Promise<void>;
}

const SINGLE_ROW_ID = 1;

@Injectable()
export class DeepSeekKeyRepository implements DeepSeekKeyStore {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findApiKey(): Promise<string | null> {
    const [row] = await this.database
      .select({ apiKey: deepSeekCredentials.apiKey })
      .from(deepSeekCredentials)
      .where(eq(deepSeekCredentials.id, SINGLE_ROW_ID));
    return row?.apiKey ?? null;
  }

  async saveApiKey(apiKey: string): Promise<void> {
    await this.database
      .insert(deepSeekCredentials)
      .values({ id: SINGLE_ROW_ID, apiKey })
      .onConflictDoUpdate({
        target: deepSeekCredentials.id,
        set: { apiKey, updatedAt: new Date() },
      });
  }
}
