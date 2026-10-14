import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { expect, it, vi } from "vitest";
import { Button } from "./button";

it("only submits a form when explicitly configured as a submit button", async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn((event) => event.preventDefault());
  render(
    <form onSubmit={onSubmit}>
      <Button>普通操作</Button>
      <Button type="submit">提交</Button>
    </form>,
  );
  await user.click(screen.getByRole("button", { name: "普通操作" }));
  expect(onSubmit).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "提交" }));
  expect(onSubmit).toHaveBeenCalledTimes(1);
});

it("allows focus on an explanatory disabled button without activating its action", async () => {
  const user = userEvent.setup();
  const onClick = vi.fn();
  render(
    <Button disabled focusableWhenDisabled onClick={onClick}>
      受限操作
    </Button>,
  );
  const button = screen.getByRole("button", { name: "受限操作" });
  await user.tab();
  expect(button).toHaveFocus();
  expect(button).toHaveAttribute("aria-disabled", "true");
  await user.keyboard("{Enter} ");
  await user.click(button);
  expect(onClick).not.toHaveBeenCalled();
});

it("forwards the ref and custom render attributes to the same button", async () => {
  const ref = createRef<HTMLButtonElement>();
  const onClick = vi.fn();
  const user = userEvent.setup();
  render(
    <Button
      ref={ref}
      render={<button type="button" data-testid="custom-button" />}
      onClick={onClick}
    >
      操作
    </Button>,
  );
  const button = screen.getByTestId("custom-button");
  expect(ref.current).toBe(button);
  await user.click(button);
  expect(onClick).toHaveBeenCalledTimes(1);
});
