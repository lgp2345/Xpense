import { type RenderOptions, type RenderResult, render as renderUi } from "@testing-library/react";
import type { ReactElement } from "react";
import { OrganizationCurrencyProvider } from "@/features/organizations/organization-currency";
/** 既有货币组件用例的显式人民币组织 fixture；切换用例自行提供真实上下文。 */
export function render(ui: ReactElement, options?: RenderOptions): RenderResult {
  const Wrapper = options?.wrapper;
  return renderUi(ui, {
    ...options,
    wrapper: ({ children }) => (
      <OrganizationCurrencyProvider currencyCode="CNY">
        {Wrapper ? <Wrapper>{children}</Wrapper> : children}
      </OrganizationCurrencyProvider>
    ),
  });
}
