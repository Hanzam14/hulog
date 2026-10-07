export type NoticeKind =
  "reminder" | "confirm_payment" | "cycle_ends" | "payout_day";
type Language = "en" | "tl" | "taglish";

export interface Notice {
  userId: string;
  kind: NoticeKind;
  refId: string;
  title: string;
  body: string;
  url: string;
  sentOn: string;
}

export interface SelectionInput {
  now: Date;
  groups: { id: string; owner_id: string }[];
  memberships: { group_id: string; user_id: string; status: string }[];
  cycles: {
    id: string;
    group_id: string;
    receiver_id: string;
    status: string;
    start_date: string;
    end_date: string;
  }[];
  progress: {
    cycle_id: string;
    member_id: string;
    confirmed_days: number;
    pending_days: number;
  }[];
  payments: {
    id: string;
    cycle_id: string;
    member_id: string;
    status: string;
    created_at: string;
    deleted_at: string | null;
  }[];
  prefs: {
    user_id: string;
    reminder_time: string;
    enabled: boolean;
    language?: Language;
  }[];
  sent: { user_id: string; kind: string; ref_id: string; sent_on: string }[];
}

const manila = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
};

const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`);
const nextDay = (date: string) =>
  new Date(dayNumber(date) + 86_400_000).toISOString().slice(0, 10);

const noticeText: Record<NoticeKind, Record<Language, [string, string]>> = {
  reminder: {
    en: ["Payment reminder", "Log today's payment for this round when you're ready."],
    tl: ["Paalala sa hulog", "Itala ang hulog mo para sa round na ito kapag handa ka na."],
    taglish: ["Hulog today", "Log today’s hulog when you’re ready."],
  },
  confirm_payment: {
    en: ["Confirm payment?", "A payment needs your review."],
    tl: ["Kumpirmahin ang hulog?", "May hulog na kailangan mong tingnan."],
    taglish: ["Confirm payment?", "A member logged a hulog that needs your review."],
  },
  cycle_ends: {
    en: ["Round ends tomorrow", "Your current round ends tomorrow."],
    tl: ["Matatapos ang round bukas", "Bukas matatapos ang kasalukuyan ninyong round."],
    taglish: ["Cycle ends tomorrow", "Your current hulog cycle ends tomorrow."],
  },
  payout_day: {
    en: ["Payout day", "Today is payout day. Check in with each other."],
    tl: ["Araw ng payout", "Araw ng payout ngayon. Magkumustahan kayo."],
    taglish: ["Payout day", "Today is payout day. Check in with each other."],
  },
};

export function selectNotifications(input: SelectionInput): Notice[] {
  const local = manila(input.now);
  const today = `${local.year}-${local.month}-${local.day}`;
  const minuteOfDay = Number(local.hour) * 60 + Number(local.minute);
  const groupById = new Map(input.groups.map((group) => [group.id, group]));
  const activeByGroup = new Map<string, string[]>();
  for (const membership of input.memberships) {
    if (membership.status !== "active") continue;
    activeByGroup.set(membership.group_id, [
      ...(activeByGroup.get(membership.group_id) ?? []),
      membership.user_id,
    ]);
  }
  const prefsByUser = new Map(input.prefs.map((pref) => [pref.user_id, pref]));
  const notices: Notice[] = [];
  const sentKeys = new Set(
    input.sent.map(
      (item) => `${item.user_id}:${item.kind}:${item.ref_id}:${item.sent_on}`,
    ),
  );
  const add = (
    userId: string,
    kind: NoticeKind,
    refId: string,
    title: string,
    body: string,
  ) => {
    const key = `${userId}:${kind}:${refId}:${today}`;
    if (sentKeys.has(key)) return;
    sentKeys.add(key);
    notices.push({ userId, kind, refId, title, body, url: "/", sentOn: today });
  };
  const addLocalized = (userId: string, kind: NoticeKind, refId: string) => {
    const language = prefsByUser.get(userId)?.language ?? "taglish";
    const [title, body] = noticeText[kind][language];
    add(userId, kind, refId, title, body);
  };

  for (const cycle of input.cycles) {
    const members = activeByGroup.get(cycle.group_id) ?? [];
    const group = groupById.get(cycle.group_id);
    if (!group || cycle.status !== "accepted") continue;

    if (cycle.start_date <= today && today <= cycle.end_date) {
      const elapsed =
        Math.floor(
          (dayNumber(today) - dayNumber(cycle.start_date)) / 86_400_000,
        ) + 1;
      for (const userId of members) {
        const pref = prefsByUser.get(userId);
        if (!pref?.enabled || minuteOfDay < timeToMinutes(pref.reminder_time))
          continue;
        const paid = input.progress.find(
          (row) => row.cycle_id === cycle.id && row.member_id === userId,
        );
        const paidDays =
          (paid?.confirmed_days ?? 0) + (paid?.pending_days ?? 0);
        if (paidDays < elapsed) {
          addLocalized(userId, "reminder", cycle.id);
        }
      }
    }

    if (cycle.end_date === nextDay(today) && inMorningWindow(local)) {
      for (const userId of members) {
        if (!prefsByUser.get(userId)?.enabled) continue;
        addLocalized(userId, "cycle_ends", cycle.id);
      }
    }

    if (nextDay(cycle.end_date) === today && inMorningWindow(local)) {
      for (const userId of members) {
        if (!prefsByUser.get(userId)?.enabled) continue;
        addLocalized(userId, "payout_day", cycle.id);
      }
    }
  }

  const cutoff = input.now.getTime() - 20 * 60_000;
  for (const payment of input.payments) {
    if (
      payment.status !== "pending" ||
      payment.deleted_at ||
      Date.parse(payment.created_at) < cutoff
    )
      continue;
    const cycle = input.cycles.find((item) => item.id === payment.cycle_id);
    const group = cycle && groupById.get(cycle.group_id);
    if (!cycle || !group || cycle.status !== "accepted") continue;
    const members = activeByGroup.get(cycle.group_id) ?? [];
    const reviewer = members.find((userId) => userId !== payment.member_id);
    if (
      !members.includes(payment.member_id) ||
      !reviewer ||
      !prefsByUser.get(reviewer)?.enabled
    )
      continue;
    addLocalized(reviewer, "confirm_payment", payment.id);
  }
  return notices;
}

export function timeToMinutes(value: string): number {
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
}

function inMorningWindow(local: Record<string, string>): boolean {
  return local.hour === "09" && Number(local.minute) < 15;
}
