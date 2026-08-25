import { z } from "zod";

export const APP_NAME = "Xpense";

export const API_ROUTES = {
  health: "/health",
  ready: "/ready",
  hello: "/foundation/hello",
} as const;

export const HealthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.literal("server"),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const ReadinessResponseSchema = z.object({
  ok: z.literal(true),
  service: z.literal("server"),
  database: z.literal("ready"),
});

export type ReadinessResponse = z.infer<typeof ReadinessResponseSchema>;

export const HelloResponseSchema = z.object({
  appName: z.literal(APP_NAME),
  message: z.string(),
});

export type HelloResponse = z.infer<typeof HelloResponseSchema>;

export function makeHelloMessage(): string {
  return `Hello from ${APP_NAME} API`;
}

export * from "./api-response.js";
export * from "./auth.js";
export * from "./bookkeeping.js";
export * from "./menu.js";
export * from "./rbac.js";
export * from "./rental.js";
