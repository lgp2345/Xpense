const API_PREFIX_PATTERN = /^[A-Za-z0-9_-]+$/;

export function createApiBaseUrl(prefix: string | undefined): string {
  const value = prefix ?? "api";

  if (!API_PREFIX_PATTERN.test(value)) {
    throw new Error("VITE_API_PREFIX must be a non-empty path segment");
  }

  return `/${value}`;
}

export const API_BASE_URL = createApiBaseUrl(import.meta.env.VITE_API_PREFIX);
