import { describe, expect, it, vi } from "vitest";

import { requestContext } from "../request-context/request-context.js";
import {
  REQUEST_ID_HEADER,
  requestIdMiddleware,
  resolveRequestId,
} from "./request-id.middleware.js";

const uuidPattern = /^[0-9a-f-]{36}$/;

describe("resolveRequestId", () => {
  it("keeps a valid provided request id", () => {
    expect(resolveRequestId("req-abc_123")).toBe("req-abc_123");
  });

  it("generates a request id when the header is missing or empty", () => {
    expect(resolveRequestId(undefined)).toMatch(uuidPattern);
    expect(resolveRequestId("")).toMatch(uuidPattern);
    expect(resolveRequestId([])).toMatch(uuidPattern);
  });

  it("rejects invalid characters and oversized values", () => {
    expect(resolveRequestId("bad id!")).toMatch(uuidPattern);
    expect(resolveRequestId("x".repeat(129))).toMatch(uuidPattern);
  });
});

describe("requestIdMiddleware", () => {
  it("echoes the resolved request id and exposes it in the request context", () => {
    const request = { headers: { [REQUEST_ID_HEADER]: "req-abc" } };
    const reply = { setHeader: vi.fn() };
    let seenRequestId: string | null = null;

    requestIdMiddleware(request as never, reply as never, () => {
      seenRequestId = requestContext.getRequestId();
    });

    expect(reply.setHeader).toHaveBeenCalledWith("X-Request-Id", "req-abc");
    expect(seenRequestId).toBe("req-abc");
  });

  it("generates an id when the header is missing and still exposes it", () => {
    const request = { headers: {} };
    const reply = { setHeader: vi.fn() };
    let seenRequestId: string | null = null;

    requestIdMiddleware(request as never, reply as never, () => {
      seenRequestId = requestContext.getRequestId();
    });

    const echoed = reply.setHeader.mock.calls[0]?.[1] as string;
    expect(echoed).toMatch(uuidPattern);
    expect(seenRequestId).toBe(echoed);
  });
});
