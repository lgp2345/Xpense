import { chinaPhoneSchema, clientTypes } from "@xpense/shared";
import { z } from "zod";

export const loginSchema = z.object({
  phone: chinaPhoneSchema,
  password: z.string().min(1),
  captchaId: z.string().min(1),
  captchaText: z.string().min(1),
  clientType: z.enum(clientTypes),
  deviceId: z.string().min(1).optional(),
  deviceName: z.string().min(1).max(120).optional(),
});

/** 经过 loginSchema 校验并转换后的业务输入。 */
export type LoginDto = z.output<typeof loginSchema>;
