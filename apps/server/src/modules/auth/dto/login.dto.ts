import { clientTypes } from "@xpense/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((email) => email.toLowerCase()),
  password: z.string().min(1),
  clientType: z.enum(clientTypes),
  deviceId: z.string().min(1).optional(),
  deviceName: z.string().min(1).max(120).optional(),
});

export class LoginDto extends createZodDto(loginSchema) {}
