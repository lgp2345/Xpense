import { Controller, Dependencies, Get, UseGuards } from "@nestjs/common";
import type { CurrentUserResponse } from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { CurrentAuthContext } from "../../common/auth/current-auth-context.decorator.js";
import { AuthGuard } from "../iam/guards/auth.guard.js";
import { RbacGuard } from "../iam/guards/rbac.guard.js";
import { UserService } from "./user.service.js";

@Controller("user")
@Dependencies(UserService)
@UseGuards(AuthGuard, RbacGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  getCurrentUser(@CurrentAuthContext() authContext: AuthContext): Promise<CurrentUserResponse> {
    return this.userService.getCurrentUser(authContext);
  }
}
