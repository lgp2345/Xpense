import { type HelloResponse, HelloResponseSchema } from "@xpense/shared";

import { type ApiClient, createApiClient } from "./api-client";

type FetchHelloOptions = {
  apiBaseUrl: string;
  client?: Pick<ApiClient, "get">;
};

export async function fetchHello({
  apiBaseUrl,
  client,
}: FetchHelloOptions): Promise<HelloResponse> {
  const apiClient = client ?? createApiClient({ baseUrl: apiBaseUrl, getAccessToken: () => null });
  const data = await apiClient.get<unknown>("/foundation/hello");

  return HelloResponseSchema.parse(data);
}
