import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import {
  addButtonMenuSchema,
  addDirectoryMenuSchema,
  addExternalMenuSchema,
  addInternalMenuSchema,
  type MenuMutationDtoShape,
} from "./add-menu.dto.js";

const menuIdShape = { id: z.number().int().positive() };

export const editMenuSchema = z
  .union([
    addDirectoryMenuSchema.extend(menuIdShape),
    addInternalMenuSchema.extend(menuIdShape),
    addExternalMenuSchema.extend(menuIdShape),
    addButtonMenuSchema.extend(menuIdShape),
  ])
  .transform((value): MenuMutationDtoShape & { id: number } => value);

export class EditMenuDto extends createZodDto(editMenuSchema) {}
