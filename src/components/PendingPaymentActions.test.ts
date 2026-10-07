import { Children, isValidElement, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import PendingPaymentActions from "./PendingPaymentActions";
import { rpc } from "../data";

vi.mock("../data", () => ({ rpc: vi.fn().mockResolvedValue(undefined) }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const props = {
  id: "pending-payment",
  memberName: "Ana",
  amount: 5000,
  allowed: false,
  busy: false,
  run: async (action: () => Promise<unknown>) => {
    await action();
  },
};

describe("pending payment decline", () => {
  it("keeps decline available after the confirmation window closes", () => {
    const html = renderToStaticMarkup(
      createElement(PendingPaymentActions, props),
    );
    expect(html).toContain("round no");
    expect(html).toContain("Decline Ana&#x27;s ₱50.00");
    expect(html).not.toContain("round ok");
    expect(
      renderToStaticMarkup(
        createElement(PendingPaymentActions, { ...props, allowed: true }),
      ),
    ).toContain("round ok");
  });
  it("uses the existing soft-delete RPC only after confirmation", async () => {
    const confirm = vi.fn().mockReturnValue(false);
    vi.stubGlobal("window", { confirm });
    const element = PendingPaymentActions(props);
    const decline = Children.toArray(element.props.children).find(
      (child) =>
        isValidElement<{ className: string }>(child) &&
        child.props.className === "round no",
    );
    if (!isValidElement<{ onClick: () => void }>(decline))
      throw new Error("Decline button missing");
    decline.props.onClick();
    expect(rpc).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledWith(
      "Decline Ana's ₱50.00 hulog? It will be removed.",
    );
    confirm.mockReturnValue(true);
    decline.props.onClick();
    await Promise.resolve();
    expect(rpc).toHaveBeenCalledExactlyOnceWith("edit_payment", {
      p_id: "pending-payment",
      p_delete: true,
    });
  });
  it("disables both actions during a write", () => {
    const html = renderToStaticMarkup(
      createElement(PendingPaymentActions, {
        ...props,
        allowed: true,
        busy: true,
      }),
    );
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });
});
