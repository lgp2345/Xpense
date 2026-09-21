import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api-client";

function harness() {
  const instance = axios.create();
  const mock = new MockAdapter(instance);
  const onError = vi.fn();
  const client = createApiClient({
    baseUrl: "/api",
    getAccessToken: () => null,
    instance,
    onError,
  });
  return { client, mock, onError };
}
const failure = { code: "INTERNAL_ERROR", message: "private server detail", data: null };

describe("API failure correlation", () => {
  it("notifies once after retries and uses the final response id with safe system message", async () => {
    const { client, mock, onError } = harness();
    mock.onGet("/api/test").replyOnce(500, failure, { "X-Request-Id": "first-id" });
    mock.onGet("/api/test").reply(500, failure, { "X-Request-Id": "final-id" });
    const error = await client
      .get("/test", { retry: { attempts: 1, baseDelayMs: 0 } })
      .catch((error: unknown) => error);
    expect(error).toMatchObject({
      status: 500,
      requestId: "final-id",
      message: "服务器内部错误，请稍后重试",
    });
    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
  });

  it("keeps an expected missing refresh session quiet", async () => {
    const { client, mock, onError } = harness();
    mock
      .onPost("/api/auth/refresh")
      .reply(401, { code: "UNAUTHENTICATED", message: "未登录", data: null });
    await expect(
      client.post("/auth/refresh", undefined, { authFailure: "ignore", authRefresh: "ignore" }),
    ).rejects.toMatchObject({ status: 401 });
    expect(onError).not.toHaveBeenCalled();
  });

  it("does not notify when a retry succeeds", async () => {
    const { client, mock, onError } = harness();
    mock.onGet("/api/test").replyOnce(500, failure);
    mock.onGet("/api/test").reply(200, { code: "OK", message: "ok", data: 1 });
    await expect(client.get("/test", { retry: { attempts: 1, baseDelayMs: 0 } })).resolves.toBe(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("does not invent response ids for network failures or notify cancellation", async () => {
    const { client, mock, onError } = harness();
    mock.onPost("/api/test").networkError();
    await expect(client.post("/test")).rejects.toMatchObject({ status: 0, requestId: undefined });
    expect(onError).toHaveBeenCalledTimes(1);
    onError.mockClear();
    const controller = new AbortController();
    controller.abort();
    await expect(client.get("/test", { signal: controller.signal })).rejects.toBeDefined();
    expect(onError).not.toHaveBeenCalled();
  });

  it("keeps expected business messages and discards malformed response ids", async () => {
    const { client, mock } = harness();
    mock
      .onPost("/api/test")
      .reply(
        400,
        { code: "VALIDATION_FAILED", message: "名称不能为空", data: null },
        { "X-Request-Id": "bad id" },
      );
    await expect(client.post("/test")).rejects.toMatchObject({
      message: "名称不能为空",
      requestId: undefined,
    });
  });
});
