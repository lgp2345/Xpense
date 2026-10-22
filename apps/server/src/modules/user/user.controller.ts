import { Controller, Get, UseGuards } from "@nestjs/common";
import type { CurrentUserResponse } from "@xpense/shared";
import { CurrentSessionContext } from "../../common/auth/current-session-context.decorator.js";
import type { SessionAuthContext } from "../../common/auth/session-auth-context.js";
import { RbacGuard } from "../iam/guards/rbac.guard.js";
import { SessionAuthGuard } from "../iam/guards/session-auth.guard.js";
import { UserService } from "./user.service.js";

@Controller("user")
@UseGuards(SessionAuthGuard, RbacGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  getCurrentUser(
    @CurrentSessionContext() authContext: SessionAuthContext,
  ): Promise<CurrentUserResponse> {
    return this.userService.getCurrentUser(authContext);
  }
}
