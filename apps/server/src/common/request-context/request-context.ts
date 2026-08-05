import { AsyncLocalStorage } from "node:async_hooks";

export type RequestContext = {
  requestId: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

export const requestContext = {
  run<T>(requestId: string, callback: () => T): T {
    return storage.run({ requestId }, callback);
  },
  getRequestId(): string | null {
    return storage.getStore()?.requestId ?? null;
  },
};
