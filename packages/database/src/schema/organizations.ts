import { pgTable, uuid, bigint, varchar, jsonb, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  githubInstallationId: bigint("github_installation_id", { mode: "number" }).unique(),
  githubOrgId: bigint("github_org_id", { mode: "number" }),
  githubOrgLogin: varchar("github_org_login", { length: 255 }),
  name: varchar("name", { length: 255 }).notNull(),
  settings: jsonb("settings").default({}).$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const organizationMembers = pgTable("organization_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 50 }).notNull().default("member"), // 'owner', 'admin', 'member'
  invitedAt: timestamp("invited_at", { withTimezone: true }),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
});

export const invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  // Method A: GitHub username allowlist
  githubUsername: varchar("github_username", { length: 255 }),
  // Method B: Single-use invite link  
  inviteToken: varchar("invite_token", { length: 64 }).unique(),
  // Legacy / optional email field
  email: varchar("email", { length: 255 }),
  role: varchar("role", { length: 50 }).notNull().default("member"),
  invitedByUserId: uuid("invited_by_user_id").references(() => users.id, { onDelete: "set null" }),
  status: varchar("status", { length: 50 }).notNull().default("pending"), // 'pending', 'accepted', 'revoked'
  usedByUserId: uuid("used_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }), // nullable — allowlist entries don't expire
});

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type NewOrganizationMember = typeof organizationMembers.$inferInsert;
export type Invite = typeof invites.$inferSelect;
export type NewInvite = typeof invites.$inferInsert;
