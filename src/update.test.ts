import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  update: vi.fn(),
  apply: vi.fn(),
  reload: vi.fn(),
  options: {} as {
    onRegisteredSW: (url: string, registration: unknown) => void;
    onNeedRefresh: () => void;
  },
}));
vi.mock("virtual:pwa-register", () => ({
  registerSW: (options: typeof mock.options) => {
    mock.options = options;
    queueMicrotask(() =>
      options.onRegisteredSW("/sw.js", {
        update: mock.update,
        waiting: null,
        installing: null,
      }),
    );
    return mock.apply;
  },
}));

describe("user-controlled app updates", () => {
  let serviceWorker: EventTarget;
  let doc: EventTarget;
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("DEV", false);
    serviceWorker = new EventTarget();
    doc = new EventTarget();
    vi.stubGlobal("navigator", { serviceWorker });
    vi.stubGlobal(
      "document",
      Object.assign(doc, { visibilityState: "visible" }),
    );
    vi.stubGlobal("window", {
      location: { reload: mock.reload },
      setTimeout,
      clearTimeout,
    });
    mock.update.mockResolvedValue(undefined);
    mock.apply.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("checks at startup, throttles foreground checks, and allows manual checks", async () => {
    const time = vi.spyOn(Date, "now").mockReturnValue(2000000);
    const updates = await import("./update");
    updates.initializeUpdates();
    await vi.waitFor(() => expect(mock.update).toHaveBeenCalledTimes(1));
    expect(updates.updateSnapshot().message).toBe("");
    doc.dispatchEvent(new Event("visibilitychange"));
    await updates.checkForUpdate(true);
    expect(mock.update).toHaveBeenCalledTimes(1);
    await updates.checkForUpdate();
    expect(mock.update).toHaveBeenCalledTimes(2);
    expect(updates.updateSnapshot().message).toBe("Updated ka na ✓");
    time.mockReturnValue(2000000 + 31 * 60 * 1000);
    doc.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(mock.update).toHaveBeenCalledTimes(3));
  });
  it("dismisses only the banner, applies only on request, and reloads a first-visit tab", async () => {
    const updates = await import("./update");
    updates.initializeUpdates();
    await vi.waitFor(() => expect(mock.update).toHaveBeenCalledOnce());
    mock.options.onNeedRefresh();
    updates.dismissUpdate();
    expect(updates.updateSnapshot()).toMatchObject({
      needRefresh: true,
      dismissed: true,
    });
    expect(mock.apply).not.toHaveBeenCalled();
    serviceWorker.dispatchEvent(new Event("controllerchange"));
    expect(mock.reload).not.toHaveBeenCalled();
    await updates.applyUpdate();
    expect(mock.apply).toHaveBeenCalledWith(true);
    serviceWorker.dispatchEvent(new Event("controllerchange"));
    serviceWorker.dispatchEvent(new Event("controllerchange"));
    expect(mock.reload).toHaveBeenCalledOnce();
  });
  it("reports dev support without registering a worker", async () => {
    vi.stubEnv("DEV", true);
    const updates = await import("./update");
    updates.initializeUpdates();
    await updates.checkForUpdate();
    expect(mock.update).not.toHaveBeenCalled();
    expect(updates.updateSnapshot().message).toBe(
      "Updates ay para sa installed o built app lang.",
    );
  });
  it("reports a failed check instead of claiming the app is current", async () => {
    mock.update.mockRejectedValue(new Error("offline"));
    const updates = await import("./update");
    updates.initializeUpdates();
    await vi.waitFor(() =>
      expect(updates.updateSnapshot().checking).toBe(false),
    );
    expect(updates.updateSnapshot().message).toBe("");
    await updates.checkForUpdate();
    expect(updates.updateSnapshot().message).toBe(
      "Hindi ma-check ang update. Subukan ulit kapag online.",
    );
  });
  it("clears manual results after four seconds and resets the timer for a new check", async () => {
    const updates = await import("./update");
    updates.initializeUpdates();
    await vi.waitFor(() => expect(mock.update).toHaveBeenCalledOnce());
    vi.useFakeTimers();
    try {
      await updates.checkForUpdate();
      expect(updates.updateSnapshot().message).toBe("Updated ka na ✓");
      await vi.advanceTimersByTimeAsync(3000);
      await updates.checkForUpdate();
      await vi.advanceTimersByTimeAsync(1000);
      expect(updates.updateSnapshot().message).toBe("Updated ka na ✓");
      await vi.advanceTimersByTimeAsync(3000);
      expect(updates.updateSnapshot().message).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });
});
