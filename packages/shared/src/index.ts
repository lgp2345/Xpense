import { z } from "zod";

export const APP_NAME = "Xpense";

export const API_ROUTES = {
  health: "/health",
  hello: "/foundation/hello",
} as const;

export const HealthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.literal("server"),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const HelloResponseSchema = z.object({
  appName: z.literal(APP_NAME),
  message: z.string(),
});

export type HelloResponse = z.infer<typeof HelloResponseSchema>;

export function makeHelloMessage(): string {
  return `Hello from ${APP_NAME} API`;
}
