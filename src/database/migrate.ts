import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { getMigrationUrl } from './database-url.js';

const url = getMigrationUrl();

const client = postgres(url, { max: 1, prepare: false });
try {
  await migrate(drizzle(client), { migrationsFolder: 'drizzle' });
  console.log('Database migrations applied.');
} finally {
  await client.end();
}
