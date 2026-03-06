import { pgTable, uuid, bigint, varchar, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  githubUserId: bigint("github_user_id", { mode: "number" }).notNull().unique(),
  githubLogin: varchar("github_login", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  avatarUrl: text("avatar_url"),
  accessTokenEncrypted: text("access_token_encrypted"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
