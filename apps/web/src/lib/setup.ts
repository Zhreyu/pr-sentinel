import { db } from "@pr-sentinel/database";
import { CONFIG_KEYS, systemConfig } from "@pr-sentinel/database/schema";
import { eq } from "drizzle-orm";

export async function isSetupComplete(): Promise<boolean> {
  try {
    const row = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, CONFIG_KEYS.SETUP_COMPLETE))
      .limit(1)
      .then((rows) => rows[0]);

    return row?.value === "true";
  } catch {
    return false;
  }
}
