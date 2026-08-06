import { describe, expect, it, vi } from "vitest";

import { requestContext } from "../request-context/request-context.js";
import { createRequestLogger } from "./request-logger.js";

describe("createRequestLogger", () => {
  it("injects the request id when logging inside a request context", () => {
    const delegate = { error: vi.fn() };
    const logger = createRequestLogger("Test", delegate);

    requestContext.run("req-123", () => {
      logger.error({ message: "boom" });
    });

    expect(delegate.error).toHaveBeenCalledWith({ message: "boom", requestId: "req-123" });
  });

  it("omits the request id when logging outside a request context", () => {
    const delegate = { error: vi.fn() };
    const logger = createRequestLogger("Test", delegate);

    logger.error({ message: "background" });

    expect(delegate.error).toHaveBeenCalledWith({ message: "background" });
  });

  it("exposes warn and log methods with the request id", () => {
    const delegate = { error: vi.fn(), warn: vi.fn(), log: vi.fn() };
    const logger = createRequestLogger("Test", delegate);

    requestContext.run("req-456", () => {
      logger.warn({ message: "warning" });
      logger.log({ message: "info" });
    });

    expect(delegate.warn).toHaveBeenCalledWith({ message: "warning", requestId: "req-456" });
    expect(delegate.log).toHaveBeenCalledWith({ message: "info", requestId: "req-456" });
  });
});
