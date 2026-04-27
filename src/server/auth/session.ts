import NextAuth from "next-auth";
import type { NextAuthConfig, Session } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { verifyPassword } from "@/server/auth/password";

export { hashPassword } from "@/server/auth/password";

const authConfig: NextAuthConfig = {
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials.email || !credentials.password) {
          return null;
        }

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, credentials.email as string));

        if (!user) return null;

        const valid = verifyPassword(credentials.password as string, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
};

const nextAuthResult = NextAuth(authConfig);

export const handlers = nextAuthResult.handlers;

export async function auth(): Promise<Session | null> {
  return nextAuthResult.auth();
}

export async function signIn(
  provider?: string,
  options?: { redirectTo?: string; redirect?: boolean },
): Promise<void> {
  return nextAuthResult.signIn(provider as never, options as never) as Promise<void>;
}

export async function signOut(options?: {
  redirectTo?: string;
  redirect?: boolean;
}): Promise<void> {
  return nextAuthResult.signOut(options as never) as Promise<void>;
}
