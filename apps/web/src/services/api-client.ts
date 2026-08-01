type ApiErrorPayload = {
  code?: string;
  message?: string;
};

export type ApiClientOptions = {
  baseUrl?: string;
  getAccessToken: () => string | null;
  fetchImpl?: typeof fetch;
  onAuthFailure?: (error: ApiError, requestAccessToken: string | null) => void;
};

export type ApiRequestOptions = {
  authFailure?: "ignore" | "notify";
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function createApiClient(options: ApiClientOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl?.replace(/\/$/, "");

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    requestOptions: ApiRequestOptions = {},
  ): Promise<T> {
    if (!baseUrl) {
      throw new Error("VITE_API_BASE_URL is required");
    }

    const token = options.getAccessToken();
    const response = await fetchImpl(`${baseUrl}${path}`, {
      credentials: "include",
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await parsePayload(response);

    if (!response.ok) {
      const errorPayload = payload as ApiErrorPayload | undefined;
      const error = new ApiError(
        response.status,
        errorPayload?.code ?? "REQUEST_FAILED",
        errorPayload?.message ?? "Request failed",
      );

      if (response.status === 401 && requestOptions.authFailure !== "ignore") {
        options.onAuthFailure?.(error, token);
      }

      throw error;
    }

    return payload as T;
  }

  return {
    get: <T>(path: string, requestOptions?: ApiRequestOptions) =>
      request<T>("GET", path, undefined, requestOptions),
    post: <T>(path: string, body?: unknown, requestOptions?: ApiRequestOptions) =>
      request<T>("POST", path, body, requestOptions),
    patch: <T>(path: string, body?: unknown, requestOptions?: ApiRequestOptions) =>
      request<T>("PATCH", path, body, requestOptions),
    delete: <T>(path: string, requestOptions?: ApiRequestOptions) =>
      request<T>("DELETE", path, undefined, requestOptions),
  };
}

async function parsePayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export type ApiClient = ReturnType<typeof createApiClient>;
