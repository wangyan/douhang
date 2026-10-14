import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

loadEnv();

export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL || 'file:./data/sqlite.db',
  },
});
