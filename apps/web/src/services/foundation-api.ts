import { type HelloResponse, HelloResponseSchema } from "@xpense/shared";

import { type ApiClient, createApiClient } from "./api-client";

type FetchHelloOptions = {
  apiBaseUrl: string;
  client?: Pick<ApiClient, "get">;
};

/**
 * 获取基础连通性数据，并在响应解包后按共享 schema 做运行时校验。
 * 未注入 client 时创建无访问令牌的客户端，此入口不依赖 WEB 会话。
 *
 * @param options 接口基础地址及可选的可替代客户端。
 * @returns 符合共享契约的业务数据；网络、协议或 schema 校验失败时抛错。
 */
export async function fetchHello({
  apiBaseUrl,
  client,
}: FetchHelloOptions): Promise<HelloResponse> {
  const apiClient = client ?? createApiClient({ baseUrl: apiBaseUrl, getAccessToken: () => null });
  const data = await apiClient.get<unknown>("/foundation/hello");

  return HelloResponseSchema.parse(data);
}
