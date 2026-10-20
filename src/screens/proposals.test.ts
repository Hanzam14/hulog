import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ViewProps } from "../components/shared";
import { rpc } from "../data";
import { setLang } from "../i18n";
import { createInitialSoloSnapshot } from "../solo";
import Propose from "./Propose";
import ProposeIpon from "./ProposeIpon";

// Capture real form handlers without adding a DOM/test-renderer dependency.
const state = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
vi.mock("react", async () => ({
  ...(await vi.importActual<typeof import("react")>("react")),
  useState: (initial: unknown) => {
    const index = state.cursor++;
    if (!(index in state.values)) state.values[index] = initial;
    return [
      state.values[index],
      (value: unknown) => {
        state.values[index] = value;
      },
    ];
  },
}));
vi.mock("react-router-dom", async () => ({
  ...(await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  )),
  useNavigate: () => vi.fn(),
}));
vi.mock("../data", () => ({ rpc: vi.fn().mockResolvedValue(undefined) }));

type NodeProps = {
  children?: ReactNode;
  onClick?: () => void;
  onChange?: (event: { target: { value: string } }) => void;
  onSubmit?: (event: {
    preventDefault: () => void;
    currentTarget: unknown;
  }) => void;
  disabled?: boolean;
  placeholder?: string;
};
function nodes(node: ReactNode): ReactElement<NodeProps>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as ReactElement<NodeProps>;
  return [element, ...nodes(element.props.children)];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (node && typeof node === "object" && "props" in node)
    return text((node as ReactElement<NodeProps>).props.children);
  return "";
}
function form(Screen: typeof Propose, local = false, singleMember = false) {
  const store: Record<string, string> = { "hulog-solo-mode": String(local) };
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
  });
  vi.stubGlobal(
    "FormData",
    class {
      get() {
        return "2026-10-21";
      }
    },
  );
  const data = createInitialSoloSnapshot(
    "a",
    singleMember ? "standalone" : "partnered",
  );
  let action: Promise<unknown> | undefined;
  const props: ViewProps = {
    data,
    user: "a",
    busy: false,
    run: async (fn) => {
      action = fn();
      await action;
    },
  };
  const render = () => {
    state.cursor = 0;
    return Screen(props);
  };
  let tree = render();
  return {
    buttons: () => nodes(tree).filter((n) => n.type === "button"),
    click: (label: string) => {
      const button = nodes(tree).find(
        (n) => n.type === "button" && text(n.props.children) === label,
      );
      expect(button, label).toBeDefined();
      expect(button!.props.disabled).not.toBe(true);
      button!.props.onClick!();
      tree = render();
    },
    title: (value: string) => {
      const input = nodes(tree).find(
        (n) => n.type === "input" && n.props.placeholder,
      );
      input!.props.onChange!({ target: { value } });
      tree = render();
    },
    submit: async () => {
      tree.props.onSubmit!({ preventDefault() {}, currentTarget: {} });
      await action;
      const [name, payload] = vi.mocked(rpc).mock.calls.at(-1)!;
      if (!payload) throw new Error("Proposal did not supply a payload");
      return [name, payload] as const;
    },
  };
}
beforeEach(() => {
  state.values = [];
  state.cursor = 0;
  setLang("en");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  setLang("taglish");
});

describe("proposal backend contracts", () => {
  it.each([false, true])(
    "omits local flags from hosted cycle proposals (single member: %s)",
    async (single) => {
      const screen = form(Propose, false, single);
      expect(
        screen
          .buttons()
          .some((n) => text(n.props.children).includes("Solo round")),
      ).toBe(false);
      const [name, payload] = await screen.submit();
      expect(name).toBe("propose_cycle");
      expect(payload).not.toHaveProperty("p_is_solo");
    },
  );
  it.each(["Matched cadence", "Flexible shared pot"])(
    "omits local flags from hosted %s goals",
    async (mode) => {
      const screen = form(ProposeIpon);
      screen.click(mode);
      screen.title("Trip");
      const [name, payload] = await screen.submit();
      expect(name).toBe("propose_savings_goal");
      expect(payload).not.toHaveProperty("p_is_solo");
      expect(payload.p_title).toBe("Trip");
    },
  );
  it("offers hosted solo saving only as a flexible goal", async () => {
    const screen = form(ProposeIpon);
    screen.click("Solo goal (just me — visible to partner)");
    screen.title("AI subscription");
    const matched = screen
      .buttons()
      .find((n) => text(n.props.children) === "Matched cadence");
    expect(matched?.props.disabled).toBe(true);
    const [, payload] = await screen.submit();
    expect(payload).not.toHaveProperty("p_is_solo");
    expect(payload.p_goal_mode).toBe("flexible");
    expect(payload.p_title).toBe("[Solo] AI subscription");
    expect(payload).not.toHaveProperty("p_num_steps");
  });
  it("recognizes a typed solo prefix even with shared scope selected", async () => {
    const screen = form(ProposeIpon);
    screen.title("[Solo: Ana] AI subscription");
    const [, payload] = await screen.submit();
    expect(payload.p_goal_mode).toBe("flexible");
    expect(payload.p_title).toBe("[Solo: Ana] AI subscription");
  });
  it.each(["Matched cadence", "Flexible solo pot"])(
    "preserves labeled solo prefixes in local %s goals",
    async (mode) => {
      const screen = form(ProposeIpon, true, true);
      screen.click(mode);
      screen.title("[Solo: Ana] AI subscription");
      const [, payload] = await screen.submit();
      expect(payload.p_title).toBe("[Solo: Ana] AI subscription");
      expect(payload.p_is_solo).toBe(true);
      expect(payload.p_goal_mode).toBe(
        mode === "Matched cadence" ? "matched" : "flexible",
      );
    },
  );
  it("keeps standalone local round proposals solo", async () => {
    const screen = form(Propose, true, true);
    const [, payload] = await screen.submit();
    expect(payload.p_is_solo).toBe(true);
    expect(payload.p_receiver_id).toBe("a");
  });
});
