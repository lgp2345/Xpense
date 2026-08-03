import { APP_NAME, type HelloResponse } from "@xpense/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
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
    <main className="grid min-h-svh place-items-center bg-background p-6">
      <section
        className="w-full max-w-2xl rounded-xl border bg-card p-8 text-card-foreground shadow-sm"
        aria-labelledby="foundation-title"
      >
        <p className="text-sm text-muted-foreground">最小工程闭环</p>
        <h1 id="foundation-title" className="mt-2 text-4xl font-semibold tracking-tight">
          {APP_NAME}
        </h1>
        <p className="mt-4 max-w-md text-sm leading-7 text-muted-foreground">
          Web 端通过统一 service 调用 NestJS API，并复用 packages/shared 中的契约。
        </p>
        <Button className="mt-6" disabled={isLoading} onClick={() => void handleCallApi()}>
          {isLoading ? "调用中..." : "调用 API"}
        </Button>
        {hello ? (
          <output className="mt-4 block rounded-lg border bg-muted/50 p-3 text-sm">
            {hello.message}
          </output>
        ) : null}
        {error ? (
          <p
            className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}
