import { API_CODES, isApiResponse } from "@xpense/shared";
import axios, {
  type AxiosError,
  AxiosHeaders,
  type AxiosInstance,
  type AxiosResponse,
} from "axios";
import { ApiError, apiErrorMessage } from "./api-error";

function responseRequestId(response: AxiosResponse | undefined): string | undefined {
  const headers = response?.headers;
  const value =
    headers instanceof AxiosHeaders
      ? headers.get("x-request-id")
      : Object.entries(headers ?? {}).find(([name]) => name.toLowerCase() === "x-request-id")?.[1];
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : undefined;
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

/** 统一解包响应和错误，响应头是错误编号的唯一来源。 */
export function configureApiResponse(instance: AxiosInstance): void {
  instance.interceptors.response.use(
    (response) => {
      const payload = response.data;
      const requestId = responseRequestId(response);
      if (!isApiResponse(payload)) {
        return Promise.reject(
          new ApiError(
            response.status,
            API_CODES.internalError,
            "服务端响应格式异常",
            undefined,
            requestId,
          ),
        );
      }
      if (payload.code === API_CODES.ok) {
        response.data = payload.data;
        return response;
      }
      return Promise.reject(
        new ApiError(
          response.status,
          payload.code,
          apiErrorMessage(response.status, payload.code, payload.message),
          payload.data,
          requestId,
        ),
      );
    },
    (error: unknown) => {
      if (axios.isCancel(error)) return Promise.reject(error);
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status ?? 0;
      const payload = axiosError.response?.data;
      const code = isApiResponse(payload) ? payload.code : codeForHttpStatus(status);
      const message = isApiResponse(payload) ? payload.message : "请求失败，请稍后重试";
      return Promise.reject(
        new ApiError(
          status,
          code,
          apiErrorMessage(status, code, message),
          isApiResponse(payload) ? payload.data : undefined,
          responseRequestId(axiosError.response),
        ),
      );
    },
  );
}
