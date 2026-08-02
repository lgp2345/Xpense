type ApiErrorPayload = {
  code?: string;
  message?: string;
};

export type ApiClientOptions = {
  baseUrl?: string;
  getAccessToken: () => string | null;
  fetchImpl?: typeof fetch;
  onAuthFailure?: (error: ApiError, requestAccessToken: string | null) => void;
  refreshAccessToken?: (requestAccessToken: string) => Promise<string | null>;
};

export type ApiRequestOptions = {
  authFailure?: "ignore" | "notify";
  authRefresh?: "ignore" | "retry";
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
  let activeRefresh:
    | {
        accessToken: string;
        promise: Promise<string | null>;
      }
    | undefined;
  let lastSuccessfulRefresh:
    | {
        accessToken: string;
        refreshedAccessToken: string;
      }
    | undefined;

  function refreshAccessToken(requestAccessToken: string): Promise<string | null> {
    if (activeRefresh?.accessToken === requestAccessToken) {
      return activeRefresh.promise;
    }

    const promise = (
      options.refreshAccessToken?.(requestAccessToken) ?? Promise.resolve(null)
    ).then((refreshedAccessToken) => {
      if (refreshedAccessToken !== null) {
        lastSuccessfulRefresh = { accessToken: requestAccessToken, refreshedAccessToken };
      }

      return refreshedAccessToken;
    });
    const refresh = { accessToken: requestAccessToken, promise };
    activeRefresh = refresh;
    const clearRefresh = () => {
      if (activeRefresh === refresh) {
        activeRefresh = undefined;
      }
    };
    void promise.then(clearRefresh, clearRefresh);

    return promise;
  }

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    requestOptions: ApiRequestOptions = {},
    hasRetried = false,
  ): Promise<T> {
    if (!baseUrl) {
      throw new Error("VITE_API_PREFIX is required");
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

      if (
        response.status === 401 &&
        !hasRetried &&
        token !== null &&
        options.refreshAccessToken &&
        requestOptions.authRefresh !== "ignore"
      ) {
        const currentAccessToken = options.getAccessToken();

        try {
          let refreshedAccessToken: string | null = null;

          if (currentAccessToken === token) {
            refreshedAccessToken = await refreshAccessToken(token);
          } else if (activeRefresh?.accessToken === token) {
            refreshedAccessToken = await activeRefresh.promise;
          } else if (
            currentAccessToken !== null &&
            lastSuccessfulRefresh?.accessToken === token &&
            lastSuccessfulRefresh.refreshedAccessToken === currentAccessToken
          ) {
            refreshedAccessToken = currentAccessToken;
          }

          if (refreshedAccessToken !== null && options.getAccessToken() === refreshedAccessToken) {
            return request(method, path, body, requestOptions, true);
          }
        } catch {
          // The original protected request owns the final auth failure notification.
        }
      }

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
