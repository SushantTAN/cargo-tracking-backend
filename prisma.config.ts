import { defineConfig } from '@prisma/config';
import 'dotenv/config';

/**
 * Prisma 7 moved datasource URLs out of the schema file and into this
 * `prisma.config.ts`. Migrations read the URL from here; the runtime
 * `PrismaClient` reads it via `datasourceUrl` in `src/config/prisma.ts`.
 */
export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL!,
  },
  migrations: {
    path: './prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
});
