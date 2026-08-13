import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { PageCacheHost, type PageCacheHostPage } from "./page-cache-host";

function StatefulPage({ label, query }: { label: string; query?: string }) {
  const [count, setCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <section data-testid={`page-${label}`}>
      <p>{label}</p>
      <p data-testid={`query-${label}`}>{query}</p>
      <button type="button" onClick={() => setCount((value) => value + 1)}>
        count {count}
      </button>
      <input aria-label={`input-${label}`} ref={inputRef} />
    </section>
  );
}

function createPage({
  keepAlive = true,
  label,
  menuId,
  params = {},
  query,
}: {
  keepAlive?: boolean;
  label: string;
  menuId: number;
  params?: Record<string, unknown>;
  query?: string;
}): PageCacheHostPage {
  return {
    keepAlive,
    menuId,
    params,
    render: () => <StatefulPage label={label} query={query} />,
  };
}

function cacheableMenus(...menuIds: number[]): ReadonlySet<number> {
  return new Set(menuIds);
}

describe("PageCacheHost", () => {
  it("switches cached pages between visible and hidden while preserving React and DOM state", async () => {
    const user = userEvent.setup();
    const view = render(
      <PageCacheHost
        activePage={createPage({ label: "members", menuId: 1 })}
        cacheableMenuIds={cacheableMenus(1, 2)}
        scopeKey="org-1"
      />,
    );

    await user.click(screen.getByRole("button", { name: "count 0" }));
    await user.type(screen.getByRole("textbox", { name: "input-members" }), "保留的输入");
    const membersDom = screen.getByTestId("page-members");

    view.rerender(
      <PageCacheHost
        activePage={createPage({ label: "roles", menuId: 2 })}
        cacheableMenuIds={cacheableMenus(1, 2)}
        scopeKey="org-1"
      />,
    );

    expect(membersDom).not.toBeVisible();
    expect(screen.getByTestId("page-roles")).toBeVisible();

    view.rerender(
      <PageCacheHost
        activePage={createPage({ label: "members", menuId: 1 })}
        cacheableMenuIds={cacheableMenus(1, 2)}
        scopeKey="org-1"
      />,
    );

    expect(screen.getByTestId("page-members")).toBe(membersDom);
    expect(screen.getByRole("button", { name: "count 1" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "input-members" })).toHaveValue("保留的输入");
  });

  it("updates captured query props without resetting the cache identity", async () => {
    const user = userEvent.setup();
    const view = render(
      <PageCacheHost
        activePage={createPage({ label: "audit", menuId: 3, query: "page=1" })}
        cacheableMenuIds={cacheableMenus()}
        scopeKey="org-1"
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "input-audit" }), "筛选草稿");
    const auditDom = screen.getByTestId("page-audit");

    view.rerender(
      <PageCacheHost
        activePage={createPage({ label: "audit", menuId: 3, query: "page=2" })}
        cacheableMenuIds={cacheableMenus()}
        scopeKey="org-1"
      />,
    );

    expect(screen.getByTestId("page-audit")).toBe(auditDom);
    expect(screen.getByTestId("query-audit")).toHaveTextContent("page=2");
    expect(screen.getByRole("textbox", { name: "input-audit" })).toHaveValue("筛选草稿");
  });

  it("keeps different route params as distinct cached page instances", async () => {
    const user = userEvent.setup();
    const view = render(
      <PageCacheHost
        activePage={createPage({ label: "member-1", menuId: 4, params: { memberId: "1" } })}
        cacheableMenuIds={cacheableMenus(4)}
        scopeKey="org-1"
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "input-member-1" }), "实例一");

    view.rerender(
      <PageCacheHost
        activePage={createPage({ label: "member-2", menuId: 4, params: { memberId: "2" } })}
        cacheableMenuIds={cacheableMenus(4)}
        scopeKey="org-1"
      />,
    );
    await user.type(screen.getByRole("textbox", { name: "input-member-2" }), "实例二");

    expect(screen.getByTestId("page-member-1")).not.toBeVisible();
    expect(screen.getByRole("textbox", { name: "input-member-2" })).toHaveValue("实例二");

    view.rerender(
      <PageCacheHost
        activePage={createPage({ label: "member-1", menuId: 4, params: { memberId: "1" } })}
        cacheableMenuIds={cacheableMenus(4)}
        scopeKey="org-1"
      />,
    );

    expect(screen.getByRole("textbox", { name: "input-member-1" })).toHaveValue("实例一");
    expect(screen.getByTestId("page-member-2")).not.toBeVisible();
  });

  it("unmounts non-keepalive pages when navigation leaves them", () => {
    const onUnmount = vi.fn();

    function DisposablePage() {
      useEffect(() => onUnmount, []);
      return <p>一次性页面</p>;
    }

    const view = render(
      <PageCacheHost
        activePage={{
          keepAlive: false,
          menuId: 5,
          params: {},
          render: () => <DisposablePage />,
        }}
        cacheableMenuIds={cacheableMenus()}
        scopeKey="org-1"
      />,
    );

    view.rerender(
      <PageCacheHost
        activePage={createPage({ label: "members", menuId: 1 })}
        cacheableMenuIds={cacheableMenus(1)}
        scopeKey="org-1"
      />,
    );

    expect(screen.queryByText("一次性页面")).not.toBeInTheDocument();
    expect(onUnmount).toHaveBeenCalledOnce();
  });

  it("clears cached pages on logout", async () => {
    const user = userEvent.setup();
    const view = render(
      <PageCacheHost
        activePage={createPage({ label: "members", menuId: 1 })}
        cacheableMenuIds={cacheableMenus(1)}
        scopeKey="org-1"
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "input-members" }), "旧组织状态");

    view.rerender(
      <PageCacheHost
        activePage={null}
        cacheableMenuIds={cacheableMenus()}
        fallback={<p>已退出</p>}
        scopeKey={null}
      />,
    );
    expect(screen.queryByTestId("page-members")).not.toBeInTheDocument();
  });

  it("does not reuse the same page identity across a direct organization switch", async () => {
    const user = userEvent.setup();
    const view = render(
      <PageCacheHost
        activePage={createPage({ label: "members", menuId: 1 })}
        cacheableMenuIds={cacheableMenus(1)}
        scopeKey="org-1"
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "input-members" }), "旧组织状态");

    view.rerender(
      <PageCacheHost
        activePage={createPage({ label: "members", menuId: 1 })}
        cacheableMenuIds={cacheableMenus(1)}
        scopeKey="org-2"
      />,
    );

    expect(screen.getByRole("textbox", { name: "input-members" })).toHaveValue("");
  });

  it.each([
    "permission loss",
    "menu deletion",
  ])("evicts a cached page after %s removes its menu authorization", async () => {
    const user = userEvent.setup();
    const view = render(
      <PageCacheHost
        activePage={createPage({ label: "members", menuId: 1 })}
        cacheableMenuIds={cacheableMenus(1, 2)}
        scopeKey="org-1"
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "input-members" }), "待淘汰状态");
    view.rerender(
      <PageCacheHost
        activePage={createPage({ label: "roles", menuId: 2 })}
        cacheableMenuIds={cacheableMenus(1, 2)}
        scopeKey="org-1"
      />,
    );
    expect(screen.getByTestId("page-members")).toBeInTheDocument();

    view.rerender(
      <PageCacheHost
        activePage={createPage({ label: "roles", menuId: 2 })}
        cacheableMenuIds={cacheableMenus(2)}
        scopeKey="org-1"
      />,
    );

    expect(screen.queryByTestId("page-members")).not.toBeInTheDocument();
  });

  it("never renders duplicate instances of the active cached page", () => {
    let renderCount = 0;

    function CountedPage() {
      renderCount += 1;
      return <p>唯一页面</p>;
    }

    render(
      <PageCacheHost
        activePage={{
          keepAlive: true,
          menuId: 1,
          params: {},
          render: () => <CountedPage />,
        }}
        cacheableMenuIds={cacheableMenus(1)}
        scopeKey="org-1"
      />,
    );

    expect(screen.getAllByText("唯一页面")).toHaveLength(1);
    expect(renderCount).toBe(1);
  });
});
