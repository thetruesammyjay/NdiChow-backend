export function getMigrationUrl(environment: NodeJS.ProcessEnv = process.env): string {
  const migrationUrl = environment.DATABASE_MIGRATION_URL;
  if (migrationUrl && new URL(migrationUrl).hostname !== 'direct-host') return migrationUrl;
  if (environment.DATABASE_URL) return environment.DATABASE_URL;
  throw new Error('DATABASE_MIGRATION_URL or DATABASE_URL is required.');
}
