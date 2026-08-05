import { API_CODES, isApiResponse } from "@xpense/shared";
import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  CanceledError,
} from "axios";

const DEFAULT_TIMEOUT_MS = 30_000;

const DEFAULT_RETRY = {
  attempts: 2,
  baseDelayMs: 300,
  maxDelayMs: 3_000,
} as const;

type RetryConfig = {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
};

export type ApiClientOptions = {
  baseUrl?: string;
  getAccessToken: () => string | null;
  instance?: AxiosInstance;
  onAuthFailure?: (error: ApiError, requestAccessToken: string | null) => void;
  refreshAccessToken?: (requestAccessToken: string) => Promise<string | null>;
};

export type ApiRequestOptions = {
  authFailure?: "ignore" | "notify";
  authRefresh?: "ignore" | "retry";
  retry?: boolean | { attempts?: number; baseDelayMs?: number; maxDelayMs?: number };
  cancelKey?: string;
  signal?: AbortSignal;
  timeout?: number;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function isGetMethod(method: string): boolean {
  return method.toUpperCase() === "GET";
}

function resolveRetryConfig(
  method: string,
  retry: ApiRequestOptions["retry"] | undefined,
): RetryConfig | null {
  if (retry === false) {
    return null;
  }
  if (retry === true) {
    return { ...DEFAULT_RETRY };
  }
  if (retry !== undefined) {
    return { ...DEFAULT_RETRY, ...retry };
  }

  return isGetMethod(method) ? { ...DEFAULT_RETRY } : null;
}

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof ApiError)) {
    return false;
  }

  return error.status === 0 || error.status === 429 || error.status >= 500;
}

function backoffDelay(attempt: number, retry: RetryConfig): number {
  const exponential = retry.baseDelayMs * 2 ** (attempt - 1);
  const bounded = Math.min(exponential, retry.maxDelayMs);

  return bounded + Math.floor(Math.random() * 100);
}

function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new CanceledError("请求已取消"));
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = () => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      reject(new CanceledError("请求已取消"));
    };

    timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function combineSignals(signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
  const active = signals.filter((signal): signal is AbortSignal => signal !== undefined);

  if (active.length === 0) {
    return undefined;
  }
  if (active.length === 1) {
    return active[0];
  }

  const controller = new AbortController();

  for (const signal of active) {
    if (signal.aborted) {
      controller.abort();
      return controller.signal;
    }
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  return controller.signal;
}

function codeForHttpStatus(status: number): string {
  switch (status) {
    case 400:
      return API_CODES.validationFailed;
    case 401:
      return API_CODES.unauthenticated;
    case 403:
      return API_CODES.forbidden;
    case 404:
      return API_CODES.notFound;
    case 409:
      return API_CODES.conflict;
    case 429:
      return API_CODES.tooManyRequests;
    case 503:
      return API_CODES.serviceUnavailable;
    default:
      return API_CODES.internalError;
  }
}

export function createApiClient(options: ApiClientOptions) {
  const baseUrl = options.baseUrl?.replace(/\/$/, "");
  const instance = options.instance ?? axios.create({ timeout: DEFAULT_TIMEOUT_MS });
  const activeRequests = new Map<string, AbortController>();
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

  instance.interceptors.response.use(
    (response) => {
      const payload = response.data;

      if (!isApiResponse(payload)) {
        return Promise.reject(
          new ApiError(response.status, API_CODES.internalError, "服务端响应格式异常"),
        );
      }
      if (payload.code === API_CODES.ok) {
        response.data = payload.data;
        return response;
      }

      return Promise.reject(
        new ApiError(response.status, payload.code, payload.message, payload.data),
      );
    },
    (error: unknown) => {
      if (axios.isCancel(error)) {
        return Promise.reject(error);
      }

      const axiosError = error as AxiosError;
      const status = axiosError.response?.status ?? 0;
      const payload = axiosError.response?.data;

      if (isApiResponse(payload)) {
        return Promise.reject(new ApiError(status, payload.code, payload.message, payload.data));
      }

      const message =
        status === 0 ? "网络异常，请检查网络连接" : (axiosError.message ?? "请求失败");

      return Promise.reject(new ApiError(status, codeForHttpStatus(status), message));
    },
  );

  function refreshAccessToken(requestAccessToken: string): Promise<string | null> {
    if (activeRefresh?.accessToken === requestAccessToken) {
      return activeRefresh.promise;
    }

    const promise = (
      options.refreshAccessToken?.(requestAccessToken) ?? Promise.resolve(null)
    ).then((refreshedAccessToken) => {
      if (refreshedAccessToken !== null) {
        lastSuccessfulRefresh = {
          accessToken: requestAccessToken,
          refreshedAccessToken,
        };
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

  function isAuthRoute(path: string): boolean {
    return path.includes("/auth/login") || path.includes("/auth/refresh");
  }

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    requestOptions: ApiRequestOptions = {},
    hasRetriedAuth = false,
  ): Promise<T> {
    if (!baseUrl) {
      throw new Error("VITE_API_PREFIX is required");
    }

    const token = options.getAccessToken();
    const cancelKey = requestOptions.cancelKey;
    let cancelController: AbortController | undefined;

    if (cancelKey !== undefined) {
      cancelController = new AbortController();
      activeRequests.get(cancelKey)?.abort();
      activeRequests.set(cancelKey, cancelController);
    }

    const signal = combineSignals([requestOptions.signal, cancelController?.signal]);
    const retry = resolveRetryConfig(method, requestOptions.retry);
    let attempt = 0;
    const headers: Record<string, string> = {};

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const config: AxiosRequestConfig = {
      url: `${baseUrl}${path}`,
      method,
      ...(body === undefined ? {} : { data: body }),
      headers,
      signal,
      timeout: requestOptions.timeout ?? DEFAULT_TIMEOUT_MS,
    };

    try {
      for (;;) {
        try {
          const response = await instance.request<T>(config);

          return response.data;
        } catch (error) {
          if (axios.isCancel(error)) {
            throw error;
          }

          if (
            error instanceof ApiError &&
            error.status === 401 &&
            !hasRetriedAuth &&
            token !== null &&
            options.refreshAccessToken !== undefined &&
            requestOptions.authRefresh !== "ignore" &&
            !isAuthRoute(path)
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

              if (
                refreshedAccessToken !== null &&
                options.getAccessToken() === refreshedAccessToken
              ) {
                return request(method, path, body, requestOptions, true);
              }
            } catch {
              // The original protected request owns the final auth failure notification.
            }
          }

          if (
            error instanceof ApiError &&
            error.status === 401 &&
            requestOptions.authFailure !== "ignore"
          ) {
            options.onAuthFailure?.(error, token);
          }

          if (retry !== null && attempt < retry.attempts && isRetryableError(error)) {
            attempt += 1;
            await sleepWithSignal(backoffDelay(attempt, retry), signal);
            continue;
          }

          throw error;
        }
      }
    } finally {
      if (
        cancelController !== undefined &&
        cancelKey !== undefined &&
        activeRequests.get(cancelKey) === cancelController
      ) {
        activeRequests.delete(cancelKey);
      }
    }
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

export type ApiClient = ReturnType<typeof createApiClient>;
