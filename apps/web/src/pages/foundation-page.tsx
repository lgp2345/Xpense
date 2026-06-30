import { APP_NAME, type HelloResponse } from "@xpense/shared";
import { useState } from "react";

import { API_BASE_URL } from "../lib/env";
import { fetchHello as fetchHelloFromApi } from "../services/foundation-api";

type FoundationPageProps = {
  fetchHello?: () => Promise<HelloResponse>;
};

export function FoundationPage({
  fetchHello = () => fetchHelloFromApi({ apiBaseUrl: API_BASE_URL }),
}: FoundationPageProps) {
  const [hello, setHello] = useState<HelloResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleCallApi() {
    setIsLoading(true);
    setError(null);

    try {
      setHello(await fetchHello());
    } catch (unknownError) {
      const message = unknownError instanceof Error ? unknownError.message : "API request failed";
      setError(message);
      setHello(null);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="foundation-shell">
      <section className="foundation-panel" aria-labelledby="foundation-title">
        <p className="foundation-kicker">最小工程闭环</p>
        <h1 id="foundation-title">{APP_NAME}</h1>
        <p className="foundation-copy">
          Web 端通过统一 service 调用 NestJS API，并复用 packages/shared 中的契约。
        </p>
        <button type="button" onClick={handleCallApi} disabled={isLoading}>
          {isLoading ? "调用中..." : "调用 API"}
        </button>
        {hello ? <output className="foundation-result">{hello.message}</output> : null}
        {error ? (
          <p className="foundation-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}
