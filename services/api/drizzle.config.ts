import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('missing_DATABASE_URL');

export default defineConfig({
  dbCredentials: { url: databaseUrl },
  dialect: 'postgresql',
  out: './drizzle',
  schema: './src/database/schema.ts',
});
