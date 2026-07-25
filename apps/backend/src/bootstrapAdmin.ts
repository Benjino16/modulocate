import { eq } from "drizzle-orm";
import { db, users } from "@modulocate/db";
import { auth } from "./auth";

// Dev/first-run convenience: guarantees a staff account exists without a
// manual signup step, the same way you'd bootstrap a superuser in Django.
// Only fires when all three ADMIN_* vars are set — no-op (not an error) if
// they're left blank, since a fresh account is otherwise reachable via the
// signup flow once one exists. Safe to leave configured across restarts:
// skips creation once a user with that email already exists.
export async function bootstrapAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME;

  if (!email || !password || !name) return;

  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) return;

  await auth.api.signUpEmail({ body: { email, password, name } });
  console.log(`Bootstrapped admin account for ${email}`);
}
