import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Exercise App's actual handlers/effects without adding a DOM dependency.
const harness = vi.hoisted(() => ({
  cells: [] as { value?: unknown; deps?: unknown[]; cleanup?: () => void }[],
  cursor: 0,
  pending: [] as (() => void)[],
  authChange: (() => {}) as (event: string, session: unknown) => void,
  resolveSession: (() => {}) as (value: unknown) => void,
  getSession: vi.fn(),
  oauth: vi.fn().mockResolvedValue({ error: null }),
}));
vi.mock("react", async () => {
  const react = await vi.importActual<typeof import("react")>("react");
  const cell = () =>
    harness.cells[harness.cursor] ?? (harness.cells[harness.cursor] = {});
  return {
    ...react,
    useState(initial: unknown) {
      const slot = cell();
      harness.cursor++;
      if (!("value" in slot))
        slot.value = typeof initial === "function" ? initial() : initial;
      return [
        slot.value,
        (value: unknown) => {
          slot.value = typeof value === "function" ? value(slot.value) : value;
        },
      ];
    },
    useRef(initial: unknown) {
      const slot = cell();
      harness.cursor++;
      if (!("value" in slot)) slot.value = { current: initial };
      return slot.value;
    },
    useCallback(fn: unknown, deps: unknown[]) {
      const slot = cell();
      harness.cursor++;
      if (!slot.deps || deps.some((d, i) => d !== slot.deps![i])) {
        slot.value = fn;
        slot.deps = deps;
      }
      return slot.value;
    },
    useEffect(fn: () => void | (() => void), deps: unknown[]) {
      const slot = cell();
      harness.cursor++;
      if (!slot.deps || deps.some((d, i) => d !== slot.deps![i])) {
        slot.deps = deps;
        harness.pending.push(() => {
          slot.cleanup?.();
          slot.cleanup = fn() || undefined;
        });
      }
    },
    useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) =>
      snapshot(),
  };
});
vi.mock("react-router-dom", async () => ({
  ...(await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  )),
  useLocation: () => ({ pathname: "/" }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getSession: harness.getSession,
      onAuthStateChange: (callback: typeof harness.authChange) => {
        harness.authChange = callback;
        return { data: { subscription: { unsubscribe() {} } } };
      },
      signInWithOAuth: harness.oauth,
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    rpc: async () => ({ data: "2026-10-21", error: null }),
    from: () => ({
      select: () => ({
        order: () => ({ range: async () => ({ data: [], error: null }) }),
      }),
    }),
  }),
}));
vi.mock("./update", () => ({
  subscribeUpdate: () => () => {},
  updateSnapshot: () => ({ needRefresh: false }),
}));
type Props = {
  children?: ReactNode;
  element?: ReactNode;
  onClick?: () => void;
  onSignOut?: () => void;
};
function nodes(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as ReactElement<Props>;
  // Route elements hold their screen in the `element` prop.
  return [
    element,
    ...nodes(element.props.children),
    ...nodes(element.props.element),
  ];
}
// Sign out is a header button before a group loads and a Group-screen action after.
function signOutAction(tree: ReactNode): (() => void) | undefined {
  const all = nodes(tree);
  const header = all.find(
    (node) =>
      node.type === "button" && text(node.props.children) === "Sign out",
  );
  return (
    header?.props.onClick ?? all.find((n) => n.props.onSignOut)?.props.onSignOut
  );
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (node && typeof node === "object" && "props" in node)
    return text((node as ReactElement<Props>).props.children);
  return "";
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  harness.cells = [];
  harness.cursor = 0;
  harness.pending = [];
  harness.authChange = () => {};
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
  });
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), {
      location: { origin: "http://localhost" },
      setTimeout,
      setInterval,
    }),
  );
  vi.stubEnv("VITE_SUPABASE_URL", "http://localhost:54321");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
  const pending = new Promise((resolve) => {
    harness.resolveSession = resolve;
  });
  harness.getSession.mockReset().mockReturnValue(pending);
  harness.oauth.mockClear();
});
afterEach(() => {
  harness.cells.forEach((cell) => cell.cleanup?.());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function app() {
  const { default: App } = await import("./App");
  const { setLang } = await import("./i18n");
  setLang("en");
  let tree: ReactNode;
  const render = () => {
    harness.cursor = 0;
    tree = App();
    harness.pending.splice(0).forEach((effect) => effect());
  };
  const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
    render();
  };
  const click = async (label: string) => {
    const action =
      label === "Sign out"
        ? signOutAction(tree)
        : nodes(tree).find(
            (node) =>
              node.type === "button" && text(node.props.children) === label,
          )?.props.onClick;
    expect(action, label).toBeDefined();
    action!();
    await flush();
  };
  render();
  // Auth subscription can reveal landing before the initial getSession settles.
  harness.authChange("INITIAL_SESSION", null);
  await flush();
  return {
    click,
    flush,
    hasButton: (label: string) =>
      label === "Sign out"
        ? signOutAction(tree) !== undefined
        : nodes(tree).some(
            (node) =>
              node.type === "button" && text(node.props.children) === label,
          ),
  };
}
describe("configured Supabase solo entry", () => {
  it("does not replace a later online session with the stale startup read after leaving solo", async () => {
    const screen = await app();
    await screen.click("Go solo on this device");
    await screen.click("Sign out");
    await screen.click("Continue with Google");
    harness.authChange("SIGNED_IN", { user: { id: "online-user" } });
    await screen.flush();
    expect(screen.hasButton("Sign out")).toBe(true);
    harness.resolveSession({ data: { session: null }, error: null });
    await screen.flush();
    expect(screen.hasButton("Sign out")).toBe(true);
  });
  it("keeps solo open when a delayed initial auth session resolves", async () => {
    const screen = await app();
    await screen.click("Go solo on this device");
    expect(screen.hasButton("Sign out")).toBe(true);
    harness.resolveSession({ data: { session: null }, error: null });
    await screen.flush();
    expect(screen.hasButton("Sign out")).toBe(true);
    expect(screen.hasButton("Continue with Google")).toBe(false);
  });
  it("can leave solo and accept a later Google session", async () => {
    const screen = await app();
    harness.resolveSession({ data: { session: null }, error: null });
    await screen.flush();
    await screen.click("Go solo on this device");
    await screen.click("Sign out");
    expect(screen.hasButton("Continue with Google")).toBe(true);
    await screen.click("Continue with Google");
    expect(harness.oauth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "google" }),
    );
    harness.authChange("SIGNED_IN", { user: { id: "online-user" } });
    await screen.flush();
    expect(screen.hasButton("Sign out")).toBe(true);
  });
  it("keeps auth listening when the app starts with saved solo mode", async () => {
    localStorage.setItem("hulog-solo-mode", "true");
    const screen = await app();
    await screen.click("Sign out");
    await screen.click("Continue with Google");
    harness.authChange("SIGNED_IN", { user: { id: "online-user" } });
    await screen.flush();
    expect(screen.hasButton("Sign out")).toBe(true);
  });
});
