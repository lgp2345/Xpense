import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

import type { AuthContext } from "./auth-context.js";

type RequestWithAuthContext = {
  authContext?: AuthContext;
};

export const CurrentAuthContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext => {
    const request = context.switchToHttp().getRequest<RequestWithAuthContext>();

    if (!request.authContext) {
      throw new Error("AuthContext is missing from request");
    }

    return request.authContext;
  },
);
