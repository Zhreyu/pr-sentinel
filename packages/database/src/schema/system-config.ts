import { pgTable, uuid, varchar, boolean, timestamp } from "drizzle-orm/pg-core";

/**
 * system_config — stores instance-level configuration.
 * Acts as the single source of truth for whether setup is complete.
 * Credentials are written to .env on disk; this table tracks meta state.
 */
export const systemConfig = pgTable("system_config", {
    id: uuid("id").primaryKey().defaultRandom(),
    key: varchar("key", { length: 255 }).notNull().unique(),
    value: varchar("value", { length: 4096 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SystemConfig = typeof systemConfig.$inferSelect;
export type NewSystemConfig = typeof systemConfig.$inferInsert;

// Typed helper for known config keys
export const CONFIG_KEYS = {
    SETUP_COMPLETE: "setup_complete",
    APP_URL: "app_url",
    AI_PROVIDERS: "ai_providers",
} as const;
