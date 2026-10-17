import { defineConfig } from 'drizzle-kit';

/** `npx drizzle-kit generate` writes the migration of a change of the schema to the drizzle folder */
export default defineConfig({
    dialect: 'postgresql',
    schema: './shared/database/schema.ts',
    out: './drizzle',
});
