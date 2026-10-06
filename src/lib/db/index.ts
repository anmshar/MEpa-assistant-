import { mkdirSync } from "node:fs";
import path from "node:path";
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

/**
 * Connects to Postgres when DATABASE_URL is set, otherwise to an embedded PGlite
 * database (real Postgres compiled to WASM) so local development needs no server.
 * Pending migrations are applied on first use.
 */
async function connect(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: postgres } = await import("postgres");
    const db = drizzlePostgres(postgres(url, { max: 10 }), { schema });
    await migratePostgres(db, { migrationsFolder: MIGRATIONS });
    return db;
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dataDir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  if (dataDir !== "memory://") mkdirSync(dataDir, { recursive: true });
  const client = dataDir === "memory://" ? new PGlite() : new PGlite(dataDir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  // The query API is identical across drivers; only the driver-specific type differs.
  return db as unknown as DB;
}

// Cache on globalThis so dev-mode hot reloads don't open a second connection
// (PGlite allows only one process per data directory).
const globalForDb = globalThis as unknown as { __mepaDb?: Promise<DB> };

export function getDb(): Promise<DB> {
  globalForDb.__mepaDb ??= connect().catch((err) => {
    globalForDb.__mepaDb = undefined;
    throw err;
  });
  return globalForDb.__mepaDb;
}

export { schema };
