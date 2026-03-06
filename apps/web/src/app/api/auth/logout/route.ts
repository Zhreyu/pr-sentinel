import { clearSession } from "@/lib/session";
import { redirect } from "next/navigation";

export async function GET() {
  await clearSession();
  redirect("/");
}

export async function POST() {
  await clearSession();
  return Response.json({ success: true });
}
