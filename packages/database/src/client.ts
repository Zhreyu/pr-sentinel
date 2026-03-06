import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Singleton for database client
let dbInstance: ReturnType<typeof createDbClient> | null = null;

function createDbClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const client = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  return drizzle(client, { schema });
}

function getDbInternal() {
  if (!dbInstance) {
    dbInstance = createDbClient();
  }
  return dbInstance;
}

// Lazy-initialized database client
// Using a Proxy so it's only created when first accessed
export const db = new Proxy({} as ReturnType<typeof createDbClient>, {
  get(_target, prop) {
    return Reflect.get(getDbInternal(), prop);
  },
});

export const getDb = getDbInternal;

export type Database = ReturnType<typeof getDbInternal>;
