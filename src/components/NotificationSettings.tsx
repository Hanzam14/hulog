import { t, label } from "../i18n";
import { useEffect, useState } from "react";
import { rpc, supabase } from "../data";
import { isIosSafariOutsideHomeScreen } from "../install";

type Preferences = { reminder_time: string; enabled: boolean };
const defaults: Preferences = { reminder_time: "20:00", enabled: false };

function decodeVapidKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

export default function NotificationSettings() {
  const [prefs, setPrefs] = useState(defaults);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const iosHelp =
    typeof navigator !== "undefined" && isIosSafariOutsideHomeScreen();
  const supported =
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window;

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [rawPrefs, registrations] = await Promise.all([
          rpc("get_notification_prefs"),
          navigator.serviceWorker?.getRegistration(),
        ]);
        const row = Array.isArray(rawPrefs) ? rawPrefs[0] : rawPrefs;
        if (alive && row)
          setPrefs({
            reminder_time: row.reminder_time.slice(0, 5),
            enabled: row.enabled,
          });
        const subscription = await registrations?.pushManager.getSubscription();
        if (alive) setSubscribed(Boolean(subscription));
      } catch (error) {
        if (alive)
          setMessage(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const savePrefs = async (next: Preferences) => {
    await rpc("set_notification_prefs", {
      p_reminder_time: next.reminder_time,
      p_enabled: next.enabled,
    });
    setPrefs(next);
  };

  const enable = async () => {
    setBusy(true);
    setMessage("");
    try {
      if (!supabase)
        throw new Error("Connect Supabase before enabling notifications.");
      const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as
        string | undefined;
      if (!publicKey)
        throw new Error("Add VITE_VAPID_PUBLIC_KEY to .env first.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted")
        throw new Error("Notification permission was not granted.");
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeVapidKey(publicKey),
        }));
      const keys = subscription.toJSON().keys;
      if (!keys?.p256dh || !keys.auth)
        throw new Error(
          "The browser returned an incomplete push subscription.",
        );
      await rpc("save_push_subscription", {
        p_endpoint: subscription.endpoint,
        p_p256dh: keys.p256dh,
        p_auth: keys.auth,
      });
      await savePrefs({ ...prefs, enabled: true });
      setSubscribed(true);
      setMessage("Notifications enabled. Salamat!");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setMessage("");
    try {
      const subscription = await (
        await navigator.serviceWorker.ready
      ).pushManager.getSubscription();
      if (subscription) {
        await rpc("delete_push_subscription", {
          p_endpoint: subscription.endpoint,
        });
        await subscription.unsubscribe();
      }
      await savePrefs({ ...prefs, enabled: false });
      setSubscribed(false);
      setMessage("Notifications disabled.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="notify">
      <h2>{t("Notifications")}</h2>
      <label>
        {t("Reminder time (Manila)")}
        <input
          type="time"
          value={prefs.reminder_time}
          onChange={(event) =>
            setPrefs({ ...prefs, reminder_time: event.target.value })
          }
        />
      </label>
      <button
        className="secondary"
        disabled={busy}
        onClick={() =>
          void savePrefs(prefs)
            .then(() => setMessage("Reminder time saved."))
            .catch((error) =>
              setMessage(
                error instanceof Error ? error.message : String(error),
              ),
            )
        }
      >
        {t("Save reminder time")}
      </button>
      {iosHelp ? (
        <p role="note">
          {t(
            "Add Hulog to your Home Screen first: tap Share, then “Add to Home Screen.” Open Hulog from that icon to enable notifications.",
          )}
        </p>
      ) : !supported ? (
        <p>{t("Your browser does not support web push notifications.")}</p>
      ) : subscribed && prefs.enabled ? (
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void disable()}
        >
          {t("Disable notifications")}
        </button>
      ) : (
        <button disabled={busy} onClick={() => void enable()}>
          {t("Enable notifications")}
        </button>
      )}
      {message && <p role="status">{label(message)}</p>}
    </section>
  );
}
