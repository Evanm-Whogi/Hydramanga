import dotenv from 'dotenv';
import { defineConfig } from 'drizzle-kit';

dotenv.config();

if (!process.env.DATABASE_URL) throw new Error("DB URL is missing");

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  dialect: 'postgresql',
  introspect: {
    casing: "camel",
  },
});