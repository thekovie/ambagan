import type { DefaultSession } from "next-auth";
import type { Role } from "@/lib/enums";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: Role; isActive: boolean } & DefaultSession["user"];
  }
  interface User {
    role: Role;
    isActive: boolean;
  }
}

declare module "@auth/core/adapters" {
  interface AdapterUser {
    role: Role;
    isActive: boolean;
  }
}
