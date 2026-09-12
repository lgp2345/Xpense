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

/** 请求层的外部依赖；会话存储和刷新策略由调用方注入。 */
export type ApiClientOptions = {
  /** 接口前缀或基础地址；未提供时在发起请求时抛错。 */
  baseUrl?: string;
  /** 每次请求读取当前访问令牌，避免固化创建客户端时的旧值。 */
  getAccessToken: () => string | null;
  /** 可注入独立实例以便测试；创建客户端时会向此实例注册响应拦截器。 */
  instance?: AxiosInstance;
  /** 最终 401 通知；携带请求时的令牌，供上层判断是否仍可清理当前会话。 */
  onAuthFailure?: (error: ApiError, requestAccessToken: string | null) => void;
  /** 刷新并保存新令牌；会话已变化等情况下返回 null，放弃本次认证重放。 */
  refreshAccessToken?: (requestAccessToken: string) => Promise<string | null>;
};

/** 单次请求策略；认证重放与网络错误重试分别控制。 */
export type ApiRequestOptions = {
  /** 默认通知最终 401；ignore 仅跳过通知，不吞掉请求错误。 */
  authFailure?: "ignore" | "notify";
  /** 默认允许符合条件的 401 刷新后重放一次；ignore 禁用此行为。 */
  authRefresh?: "ignore" | "retry";
  /** GET 默认额外重试两次，写请求默认关闭；attempts 不含首次请求。 */
  retry?: boolean | { attempts?: number; baseDelayMs?: number; maxDelayMs?: number };
  /** 同一客户端内，新请求取消相同键的旧请求，不共享其响应。 */
  cancelKey?: string;
  /** 调用方的取消信号，同时用于网络请求和重试等待。 */
  signal?: AbortSignal;
  /** 每次实际请求的超时时间，单位毫秒，默认 30 秒。 */
  timeout?: number;
};

/** 统一协议、业务和网络错误；status 为 0 表示未收到 HTTP 响应，取消错误另行透传。 */
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

/** 显式配置优先；写请求须由调用方确认重复执行安全后才能开启重试。 */
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

/** 指数退避值封顶后附加 0～99 毫秒抖动，减少并发请求同步重试。 */
function backoffDelay(attempt: number, retry: RetryConfig): number {
  const exponential = retry.baseDelayMs * 2 ** (attempt - 1);
  const bounded = Math.min(exponential, retry.maxDelayMs);

  return bounded + Math.floor(Math.random() * 100);
}

/** 在退避期间响应取消，避免已取消的请求继续下一次尝试。 */
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

/** 合并外部取消和同键取消；任一信号取消即取消合并后的信号。 */
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

function generateRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

/**
 * 创建统一请求客户端，处理鉴权头、响应解包、错误转换、重试、取消和请求追踪。
 *
 * 此层负责请求级机制；令牌读写与最终认证失败处理通过回调交给上层。
 * 登录、组织切换及用户、菜单状态的协调由 createWebSession 所在的会话层负责。
 *
 * @param options 基础地址、请求实例及会话策略。
 * @returns 返回已解包业务数据的请求方法；泛型只提供类型约束，不校验业务数据结构。
 */
export function createApiClient(options: ApiClientOptions) {
  const baseUrl = options.baseUrl?.replace(/\/$/, "");
  const instance = options.instance ?? axios.create({ timeout: DEFAULT_TIMEOUT_MS });
  const activeRequests = new Map<string, AbortController>();
  /** 同一旧令牌的并发 401 共享正在进行的刷新，避免重复轮换刷新令牌。 */
  let activeRefresh:
    | {
        accessToken: string;
        promise: Promise<string | null>;
      }
    | undefined;
  /** 保留最近一次新旧令牌映射，让迟到的 401 能辨别刷新与无关的会话变更。 */
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

  /**
   * 按旧访问令牌复用刷新任务，并记录成功映射。
   * 刷新结束时仅释放本任务占用的引用，避免误清除后来启动的刷新。
   */
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

  /** 登录和刷新接口自身的 401 不再触发刷新，避免递归认证。 */
  function isAuthRoute(path: string): boolean {
    return path.includes("/auth/login") || path.includes("/auth/refresh");
  }

  /**
   * 执行请求并捕获本次令牌；普通重试复用请求 ID，认证重放重新读取令牌并生成新 ID。
   * 只有刷新所得令牌仍是当前令牌时才重放，避免把旧请求转移到无关的新会话。
   *
   * @param method HTTP 方法，决定默认网络重试策略。
   * @param path 相对于基础地址的接口路径，调用方应包含开头的斜杠。
   * @param body 请求体；undefined 表示不主动添加 JSON 内容类型。
   * @param requestOptions 超时、取消、重试及认证失败策略。
   * @param hasRetriedAuth 是否已经认证重放，防止再次刷新形成循环。
   * @returns 服务端统一响应中的 data。
   */
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

    headers["X-Request-Id"] = generateRequestId();
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
              // 刷新失败后由原受保护请求负责最终认证失败通知。
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
