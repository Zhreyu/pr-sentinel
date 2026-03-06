import { pgTable, uuid, bigint, varchar, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const repositories = pgTable("repositories", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  githubRepoId: bigint("github_repo_id", { mode: "number" }).notNull(),
  githubFullName: varchar("github_full_name", { length: 255 }).notNull(), // e.g., "org/repo"
  defaultBranch: varchar("default_branch", { length: 255 }).default("main"),
  isActive: boolean("is_active").notNull().default(true),
  settings: jsonb("settings").default({}).$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Repository = typeof repositories.$inferSelect;
export type NewRepository = typeof repositories.$inferInsert;
