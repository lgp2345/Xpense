import type { AuthContext } from "./auth-context.js";

export type SessionAuthContext =
  | (AuthContext & { accessScope: "organization" })
  | (Omit<AuthContext, "organizationId"> & { accessScope: "platform"; organizationId: null });
