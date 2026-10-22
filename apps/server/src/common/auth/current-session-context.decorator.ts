import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

import type { SessionAuthContext } from "./session-auth-context.js";

type RequestWithSessionAuthContext = {
  sessionContext?: SessionAuthContext;
};

export const CurrentSessionContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionAuthContext => {
    const request = context.switchToHttp().getRequest<RequestWithSessionAuthContext>();

    if (!request.sessionContext) {
      throw new Error("SessionAuthContext is missing from request");
    }

    return request.sessionContext;
  },
);
