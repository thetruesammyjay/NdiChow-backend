import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';
import { getMigrationUrl } from './src/database/database-url.js';

const url = getMigrationUrl();

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema.ts',
  out: './drizzle',
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
