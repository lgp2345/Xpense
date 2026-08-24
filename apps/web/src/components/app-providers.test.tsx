import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";

import { AppProviders } from "./app-providers";

/** 验证后代读取到注入查询客户端的测试探针。 */
function QueryClientProbe({ expected }: { expected: QueryClient }) {
  const actual = useQueryClient();

  return <output>{actual === expected ? "使用注入缓存" : "使用其他缓存"}</output>;
}

describe("AppProviders", () => {
  it("uses the injected query client so every test and app boundary can isolate its cache", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <AppProviders queryClient={queryClient}>
        <QueryClientProbe expected={queryClient} />
      </AppProviders>,
    );

    expect(screen.getByText("使用注入缓存")).toBeInTheDocument();
  });
});
