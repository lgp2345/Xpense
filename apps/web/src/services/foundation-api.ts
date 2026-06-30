import { API_ROUTES, type HelloResponse, HelloResponseSchema } from "@xpense/shared";

type FetchHelloOptions = {
  apiBaseUrl: string;
  fetcher?: typeof fetch;
};

export async function fetchHello({
  apiBaseUrl,
  fetcher = fetch,
}: FetchHelloOptions): Promise<HelloResponse> {
  const response = await fetcher(`${apiBaseUrl}${API_ROUTES.hello}`);

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  return HelloResponseSchema.parse(await response.json());
}
