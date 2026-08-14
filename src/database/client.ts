import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export type AppDatabase = PostgresJsDatabase<typeof schema>;

export function createDatabase(url: string) {
  const client = postgres(url, { max: 10, prepare: false });
  const db = drizzle(client, { schema });
  return {
    db,
    ping: async () => {
      await client`select 1`;
      return true;
    },
    close: async () => client.end(),
  };
}
