import { chinaPhoneRegex } from "@xpense/shared";
import { z } from "zod";

const defaultSystemRoles = ["owner", "admin", "member", "viewer"] as const;
const defaultSystemRolesValue = defaultSystemRoles.join(",");

function hasPostgreSqlProtocol(value: string): boolean {
  try {
    return ["postgres:", "postgresql:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

const serverEnvSchema = z
  .object({
    DATABASE_URL: z.string().url().refine(hasPostgreSqlProtocol, {
      message: "DATABASE_URL must use a PostgreSQL protocol",
    }),
    JWT_ACCESS_SECRET: z.string().min(32),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    WEB_ORIGIN: z.string().url(),
    VITE_API_PREFIX: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .default("api"),
    WEB_REFRESH_TOKEN_COOKIE: z.string().min(1).default("xpense_refresh_token"),
    APP_REFRESH_TOKEN_TRANSPORT: z.literal("json_body").default("json_body"),
    SYSTEM_ROLES: z
      .string()
      .default(defaultSystemRolesValue)
      .transform((value, ctx) => {
        const roles = value.split(",").map((role) => role.trim());

        if (roles.length !== defaultSystemRoles.length) {
          ctx.addIssue({
            code: "custom",
            message: `SYSTEM_ROLES must be ${defaultSystemRolesValue}`,
          });

          return z.NEVER;
        }

        for (const [index, expectedRole] of defaultSystemRoles.entries()) {
          if (roles[index] !== expectedRole) {
            ctx.addIssue({
              code: "custom",
              message: `SYSTEM_ROLES must be ${defaultSystemRolesValue}`,
            });

            return z.NEVER;
          }
        }

        return roles as [...typeof defaultSystemRoles];
      }),
    BOOTSTRAP_SOURCE: z.literal("environment_variables").default("environment_variables"),
    PASSWORD_HASH: z.literal("argon2id").default("argon2id"),
    ACCESS_TOKEN: z.literal("jwt").default("jwt"),
    REFRESH_TOKEN: z.literal("opaque_random_hash_at_rest").default("opaque_random_hash_at_rest"),
    BOOTSTRAP_SUPER_ADMIN_EMAIL: z.string().email().optional(),
    BOOTSTRAP_SUPER_ADMIN_PHONE: z.string().regex(chinaPhoneRegex).optional(),
    BOOTSTRAP_SUPER_ADMIN_PASSWORD: z.string().min(8).optional(),
    BOOTSTRAP_ORGANIZATION_NAME: z.string().min(1).optional(),
    CAPTCHA_TTL_SECONDS: z.coerce.number().int().positive().default(60),
    LOGIN_RATE_LIMIT_IP_MAX: z.coerce.number().int().positive().default(10),
    LOGIN_RATE_LIMIT_PHONE_MAX: z.coerce.number().int().positive().default(5),
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(300),
  })
  .superRefine((env, ctx) => {
    const bootstrapValues = [
      env.BOOTSTRAP_SUPER_ADMIN_EMAIL,
      env.BOOTSTRAP_SUPER_ADMIN_PHONE,
      env.BOOTSTRAP_SUPER_ADMIN_PASSWORD,
      env.BOOTSTRAP_ORGANIZATION_NAME,
    ];

    const hasBootstrapValue = bootstrapValues.some((value) => value !== undefined);
    const hasCompleteBootstrapValues = bootstrapValues.every((value) => value !== undefined);

    if (!hasBootstrapValue || hasCompleteBootstrapValues) {
      return;
    }

    if (env.BOOTSTRAP_SUPER_ADMIN_EMAIL === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "BOOTSTRAP_SUPER_ADMIN_EMAIL is required when bootstrap env is configured",
        path: ["BOOTSTRAP_SUPER_ADMIN_EMAIL"],
      });
    }

    if (env.BOOTSTRAP_SUPER_ADMIN_PHONE === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "BOOTSTRAP_SUPER_ADMIN_PHONE is required when bootstrap env is configured",
        path: ["BOOTSTRAP_SUPER_ADMIN_PHONE"],
      });
    }

    if (env.BOOTSTRAP_SUPER_ADMIN_PASSWORD === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "BOOTSTRAP_SUPER_ADMIN_PASSWORD is required when bootstrap env is configured",
        path: ["BOOTSTRAP_SUPER_ADMIN_PASSWORD"],
      });
    }

    if (env.BOOTSTRAP_ORGANIZATION_NAME === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "BOOTSTRAP_ORGANIZATION_NAME is required when bootstrap env is configured",
        path: ["BOOTSTRAP_ORGANIZATION_NAME"],
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(env: NodeJS.ProcessEnv): ServerEnv {
  return serverEnvSchema.parse(env);
}
