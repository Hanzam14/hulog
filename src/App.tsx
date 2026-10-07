import { t, useLanguage, label, type Key } from "./i18n";
import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Link, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { load, supabase } from "./data";
import type { Snapshot } from "./data";
import type { Run } from "./components/shared";
import Join from "./screens/Join";
import NoGroup from "./screens/NoGroup";
import Home from "./screens/Home";
import Propose from "./screens/Propose";
import Detail from "./screens/Detail";
import History from "./screens/History";
import Changes from "./screens/Changes";
import Settings from "./screens/Settings";
import Record from "./screens/Record";
import Tally from "./components/Tally";
import { UpdateBanner } from "./components/AppUpdates";
import { celebratePayout, recentlyReceived } from "./components/confetti";
import { closed } from "./components/shared";
import {
  IconBell,
  IconCalendar,
  IconHome,
  IconUsers,
} from "@tabler/icons-react";

export default function App() {
  useLanguage();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<{ message: Key } | null>(null);
  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(null), 3000);
    return () => window.clearTimeout(timer);
  }, [success]);
  const location = useLocation();
  useEffect(() => {
    if (
      !data ||
      !session ||
      !data.memberships.some(
        (m) => m.user_id === session.user.id && m.status === "active",
      )
    )
      return;
    for (const cycle of data.cycles) {
      if (
        closed(cycle) &&
        cycle.payout_state === "Received" &&
        recentlyReceived(cycle.received_at) &&
        cycle.receiver_id !== session.user.id
      ) {
        celebratePayout(cycle.id, data);
      }
    }
  }, [data, session]);
  const refresh = useCallback(async () => {
    const next = await load();
    setData(next);
  }, []);
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(({ data: result, error: authError }) => {
      if (alive) {
        setSession(result.session);
        setReady(true);
        if (authError) setError(authError.message);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, next) => {
        setSession(next);
        setData(null);
        setReady(true);
      },
    );
    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!session) return;
    let alive = true;
    const reload = () =>
      load()
        .then((next) => {
          if (alive) setData(next);
        })
        .catch((e) => {
          if (alive) setError(String(e.message));
        });
    void reload();
    const timer = window.setInterval(() => {
      void reload();
    }, 30000);
    window.addEventListener("focus", reload);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("focus", reload);
    };
  }, [session]);
  const run: Run = async (action) => {
    setBusy(true);
    setError("");
    setSuccess(null);
    try {
      await action();
      if ((await supabase!.auth.getSession()).data.session) await refresh();
      setSuccess({ message: "Saved. Salamat!" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const signIn = () =>
    run(async () => {
      const { error: authError } = await supabase!.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}${location.pathname}`,
        },
      });
      if (authError) throw authError;
    });
  const signOut = () =>
    run(async () => {
      const { error: authError } = await supabase!.auth.signOut();
      if (authError) throw authError;
      setData(null);
    });
  if (!supabase)
    return (
      <main className="welcome">
        <UpdateBanner />
        <h1>{t("Hulog")}</h1>
        <p>{t("Our pot, one day at a time.")}</p>
        <section>
          <h2>{t("Connect your Supabase project")}</h2>
          <p>
            {t(
              "Copy .env.example to .env and follow SETUP.md, then restart the app.",
            )}
          </p>
        </section>
      </main>
    );
  const own = data?.memberships.find((m) => m.user_id === session?.user.id);
  return (
    <div className="app">
      <header>
        <Link to="/" className="brand">
          {t("Hulog").toLowerCase()}
          <span className="dot">.</span>
        </Link>
        {session && (
          <button className="quiet" disabled={busy} onClick={signOut}>
            {t("Sign out")}
          </button>
        )}
      </header>
      <UpdateBanner />
      {error && (
        <div role="alert" className="notice error">
          {label(error)}
          <button className="quiet" onClick={() => setError("")}>
            {t("Dismiss")}
          </button>
        </div>
      )}
      {success && (
        <div role="status" className="notice">
          {t(success.message)}
        </div>
      )}
      {!ready ? (
        <main>
          <p>{t("Loading…")}</p>
        </main>
      ) : !session ? (
        <main className="welcome">
          <h1>
            {t("Paluwagan para sa")}
            <br />
            {t("ating dalawa")}
            <span className="dot">.</span>
          </h1>
          <p>
            {t(
              "One sticker for every day you hulog. Fill your row, take turns getting the pot. You hold the money; Hulog keeps the record.",
            )}
          </p>
          <figure>
            <div className="row">
              <strong>{t("Angelo")}</strong>
              <span className="meta">9/15</span>
            </div>
            <Tally
              label={t("Angelo")}
              paid={9}
              pending={0}
              total={15}
              tone="pink"
            />
            <div className="row">
              <strong>{t("Vinice")}</strong>
              <span className="meta">7/15</span>
            </div>
            <Tally
              label={t("Vinice")}
              paid={7}
              pending={2}
              total={15}
              tone="blue"
            />
            <figcaption>{t("Example: ₱50 a day for 15 days.")}</figcaption>
          </figure>
          <button disabled={busy} onClick={signIn}>
            {t("Continue with Google")}
          </button>
          {location.pathname.startsWith("/join/") && (
            <p>{t("Your invite will be here after sign-in.")}</p>
          )}
        </main>
      ) : !data ? (
        <main>
          <p>{t("Loading your group…")}</p>
          <button disabled={busy} onClick={() => run(refresh)}>
            {t("Try again")}
          </button>
        </main>
      ) : own && own.status !== "active" ? (
        <main>
          <h1>
            {own.status === "pending"
              ? t("Konting hintay.")
              : t("Request denied")}
          </h1>
          <p>
            {own.status === "pending"
              ? t(
                  "Your holder will review your join request. This screen refreshes automatically.",
                )
              : t(
                  "Ask the group owner about your request. Your membership must be removed before you can join elsewhere.",
                )}
          </p>
          <button disabled={busy} onClick={() => run(refresh)}>
            {t("Refresh status")}
          </button>
        </main>
      ) : !own ? (
        <main>
          <Routes>
            <Route
              path="/join/:token"
              element={<Join run={run} busy={busy} />}
            />
            <Route path="*" element={<NoGroup run={run} busy={busy} />} />
          </Routes>
        </main>
      ) : (
        <>
          <nav>
            <NavLink to="/" end>
              <IconHome aria-hidden="true" />
              <span className="sr-only">{t("Home")}</span>
            </NavLink>
            <NavLink to="/history">
              <IconCalendar aria-hidden="true" />
              <span className="sr-only">{t("History")}</span>
            </NavLink>
            <NavLink to="/changes">
              <IconBell aria-hidden="true" />
              <span className="sr-only">{t("Changes")}</span>
              {data.changes.some((h) => h.unread) && (
                <span className="badge">
                  {data.changes.filter((h) => h.unread).length}
                </span>
              )}
            </NavLink>
            <NavLink to="/settings">
              <IconUsers aria-hidden="true" />
              <span className="sr-only">{t("Group")}</span>
            </NavLink>
          </nav>
          <main>
            <Routes>
              <Route
                path="/"
                element={
                  <Home
                    data={data}
                    user={session.user.id}
                    run={run}
                    busy={busy}
                  />
                }
              />
              <Route
                path="/hulog"
                element={
                  <Record
                    data={data}
                    user={session.user.id}
                    run={run}
                    busy={busy}
                  />
                }
              />
              <Route
                path="/propose"
                element={
                  <Propose
                    data={data}
                    user={session.user.id}
                    run={run}
                    busy={busy}
                  />
                }
              />
              <Route
                path="/cycles/:id"
                element={
                  <Detail
                    data={data}
                    user={session.user.id}
                    run={run}
                    busy={busy}
                  />
                }
              />
              <Route
                path="/history"
                element={
                  <History
                    data={data}
                    user={session.user.id}
                    run={run}
                    busy={busy}
                  />
                }
              />
              <Route
                path="/changes"
                element={<Changes data={data} run={run} busy={busy} />}
              />
              <Route
                path="/settings"
                element={
                  <Settings
                    data={data}
                    user={session.user.id}
                    run={run}
                    busy={busy}
                  />
                }
              />
              <Route
                path="*"
                element={
                  <p>
                    {t("You already have a group.")}{" "}
                    <Link to="/">{t("Go home")}</Link>
                  </p>
                }
              />
            </Routes>
          </main>
        </>
      )}
      <footer>{t("Records only. No money moves through Hulog.")}</footer>
    </div>
  );
}
