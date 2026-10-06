import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { selectNotifications } from "../_shared/selection.ts";

const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name} function secret`);
  return value;
};

Deno.serve(async (request) => {
  if (request.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  const cronSecret = env("NOTIFY_CRON_SECRET");
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(
    env("SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
  const now = new Date();
  const localParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = Object.fromEntries(
    localParts.map((item) => [item.type, item.value]),
  );
  const sentOn = `${part.year}-${part.month}-${part.day}`;
  const recentSince = new Date(now.getTime() - 20 * 60_000).toISOString();

  const [
    groups,
    memberships,
    cycles,
    progress,
    payments,
    prefs,
    subscriptions,
    sent,
  ] = await Promise.all([
    supabase.from("groups").select("id,owner_id"),
    supabase
      .from("memberships")
      .select("group_id,user_id,status")
      .eq("status", "active"),
    supabase
      .from("cycle_summary")
      .select("id,group_id,receiver_id,status,start_date,end_date"),
    supabase
      .from("member_progress")
      .select("cycle_id,member_id,confirmed_days,pending_days"),
    supabase
      .from("payments")
      .select("id,cycle_id,member_id,status,created_at,deleted_at")
      .eq("status", "pending")
      .is("deleted_at", null)
      .gte("created_at", recentSince),
    supabase
      .from("notification_prefs")
      .select("user_id,reminder_time,enabled")
      .eq("enabled", true),
    supabase.from("push_subscriptions").select("user_id,endpoint,p256dh,auth"),
    supabase
      .from("notification_log")
      .select("user_id,kind,ref_id,sent_on")
      .eq("sent_on", sentOn),
  ]);
  const result = [
    groups,
    memberships,
    cycles,
    progress,
    payments,
    prefs,
    subscriptions,
    sent,
  ].find((query) => query.error);
  if (result?.error) {
    console.error("Notification source query failed", result.error.message);
    return new Response("Notification source query failed", { status: 500 });
  }

  const notices = selectNotifications({
    now,
    groups: groups.data ?? [],
    memberships: memberships.data ?? [],
    cycles: cycles.data ?? [],
    progress: progress.data ?? [],
    payments: payments.data ?? [],
    prefs: prefs.data ?? [],
    sent: sent.data ?? [],
  });
  const subsByUser = new Map<string, typeof subscriptions.data>();
  for (const subscription of subscriptions.data ?? []) {
    subsByUser.set(subscription.user_id, [
      ...(subsByUser.get(subscription.user_id) ?? []),
      subscription,
    ]);
  }

  webpush.setVapidDetails(
    env("VAPID_SUBJECT"),
    env("VAPID_PUBLIC_KEY"),
    env("VAPID_PRIVATE_KEY"),
  );
  let sentCount = 0;
  let expiredCount = 0;
  for (const notice of notices) {
    const userSubscriptions = subsByUser.get(notice.userId) ?? [];
    if (userSubscriptions.length === 0) continue;
    const { error: claimError } = await supabase
      .from("notification_log")
      .insert({
        user_id: notice.userId,
        kind: notice.kind,
        ref_id: notice.refId,
        sent_on: notice.sentOn,
      });
    if (claimError?.code === "23505") continue;
    if (claimError) {
      console.error("Notification dedupe claim failed", claimError.message);
      continue;
    }

    let retryLater = false;
    for (const subscription of userSubscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify({
            title: notice.title,
            body: notice.body,
            url: notice.url,
          }),
          { TTL: 86_400 },
        );
        sentCount += 1;
      } catch (error) {
        const statusCode = Number(
          (error as { statusCode?: number }).statusCode ?? 0,
        );
        if (statusCode === 404 || statusCode === 410) {
          await supabase
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", subscription.endpoint);
          expiredCount += 1;
        } else {
          retryLater = true;
          console.error("Push delivery failed", statusCode || "unknown");
        }
      }
    }
    if (retryLater) {
      await supabase
        .from("notification_log")
        .delete()
        .eq("user_id", notice.userId)
        .eq("kind", notice.kind)
        .eq("ref_id", notice.refId)
        .eq("sent_on", notice.sentOn);
    }
  }
  return Response.json({ sent: sentCount, expiredSubscriptions: expiredCount });
});
