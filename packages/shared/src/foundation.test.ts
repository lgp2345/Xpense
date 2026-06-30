import { describe, expect, it } from "vitest";

import { API_ROUTES, APP_NAME, HelloResponseSchema, makeHelloMessage } from "./index";

describe("foundation shared contract", () => {
  it("keeps app identity and API routes in one shared package", () => {
    expect(APP_NAME).toBe("Xpense");
    expect(API_ROUTES.health).toBe("/health");
    expect(API_ROUTES.hello).toBe("/foundation/hello");
  });

  it("builds the hello response message from the shared app name", () => {
    const response = HelloResponseSchema.parse({
      appName: APP_NAME,
      message: makeHelloMessage(),
    });

    expect(response).toEqual({
      appName: "Xpense",
      message: "Hello from Xpense API",
    });
  });
});
