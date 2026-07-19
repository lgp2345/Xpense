import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";

import { AuthGuard } from "../iam/guards/auth.guard.js";

@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly authGuard: AuthGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      await this.authGuard.canActivate(context);
    } catch {
      // Logout is idempotent: an invalid bearer must not prevent refresh Cookie cleanup.
    }

    return true;
  }
}
