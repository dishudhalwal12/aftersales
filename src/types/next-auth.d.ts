import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

// Auth.js v5 resolves the jwt callback types from @auth/core/jwt; augmenting
// "next-auth/jwt" would only touch the re-export module and not this interface.
declare module "@auth/core/jwt" {
  interface JWT {
    uid?: string;
  }
}
