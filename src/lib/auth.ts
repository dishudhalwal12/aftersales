import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { DEMO_USER_EMAIL, DEMO_USER_NAME } from "@/lib/constants";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
});

const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
const googleEnabled = Boolean(googleClientId && googleClientSecret);

export async function ensureDemoUser() {
  return prisma.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: {},
    create: { email: DEMO_USER_EMAIL, name: DEMO_USER_NAME },
  });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/auth" },
  providers: [
    Credentials({
      id: "credentials",
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        });
        if (!user?.passwordHash) return null;

        const passwordMatches = await bcrypt.compare(
          parsed.data.password,
          user.passwordHash
        );
        if (!passwordMatches) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
    Credentials({
      id: "demo",
      name: "Judge Demo Login",
      credentials: {},
      async authorize() {
        const user = await ensureDemoUser();
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
    ...(googleEnabled
      ? [
          Google({
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (account?.provider === "google" && token.email) {
        const email = token.email.toLowerCase();
        const dbUser = await prisma.user.upsert({
          where: { email },
          update: { googleId: account.providerAccountId },
          create: {
            email,
            name: token.name ?? null,
            googleId: account.providerAccountId,
          },
        });
        token.uid = dbUser.id;
      } else if (user?.id) {
        token.uid = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid) {
        session.user.id = token.uid;
      }
      return session;
    },
  },
});

export type SessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  return { id, email: session.user.email, name: session.user.name };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new ApiError(401, "UNAUTHORIZED", "You must be signed in to do that.");
  }
  return user;
}

// Tenant ownership guard. Returns 403 for both "not found" and "not yours" so
// the API never reveals whether another tenant's business exists.
export async function assertBusinessOwnership(userId: string, businessId: string) {
  const business = await prisma.business.findFirst({
    where: { id: businessId, ownerId: userId },
  });

  if (!business) {
    throw new ApiError(403, "FORBIDDEN", "You do not have access to this business.");
  }

  return business;
}
