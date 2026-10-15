// Sends a web push at the minute a task with a time comes due.
//
// Runs once a minute (pg_cron -> pg_net -> this function). It reads each
// subscribed user's planner, finds reminders that are open, due today in that
// user's time zone, whose time has arrived in the last 30 minutes, and that
// have not been sent yet, and pushes one notification per reminder to every
// device that user has subscribed. What it sent is written to push_sent so a
// reminder is announced once, however many times this runs.
//
// Secrets (Function secrets, never in the repo): VAPID_PUBLIC_KEY,
// VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET. SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided by Supabase itself.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT")!,
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

const WINDOW_MIN = 30;

function localNow(tz: string) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return {
    date: `${g("year")}-${g("month")}-${g("day")}`,
    min: Number(g("hour")) * 60 + Number(g("minute")),
  };
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);

  // A signed-in user asking for a test notification to their own devices —
  // how the app confirms alerts work right after turning them on. Identified
  // by their session token; the cron secret is not involved and nobody
  // else's subscriptions are touched.
  if (url.searchParams.get("test") === "1") {
    // With the cron secret it tests every subscription (used to check the
    // server end to end); with a session token, only that user's.
    const admin = req.headers.get("x-cron-secret") === Deno.env.get("CRON_SECRET");
    let q = sb.from("push_subs").select("*");
    if (!admin) {
      const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: u } = await sb.auth.getUser(jwt);
      if (!u?.user) return new Response("forbidden", { status: 403, headers: cors });
      q = q.eq("user_id", u.user.id);
    }
    const { data: mine } = await q;
    const out: any[] = [];
    for (const s of mine ?? []) {
      try {
        const res = await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: "🔔 Stoic", body: "Los avisos funcionan en este aparato.", tag: "stoic-test", url: "./" }),
          { TTL: 300, urgency: "high" },
        );
        out.push({ status: res.statusCode });
      } catch (e: any) {
        out.push({ error: e?.statusCode ?? String(e) });
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await sb.from("push_subs").delete().eq("endpoint", s.endpoint);
        }
      }
    }
    return Response.json({ ok: true, test: true, results: out }, { headers: cors });
  }

  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("forbidden", { status: 403, headers: cors });
  }
  const dry = url.searchParams.get("dry") === "1";

  const { data: subs, error } = await sb.from("push_subs").select("*");
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const byUser = new Map<string, any[]>();
  for (const s of subs ?? []) {
    if (!byUser.has(s.user_id)) byUser.set(s.user_id, []);
    byUser.get(s.user_id)!.push(s);
  }

  const report: any[] = [];
  for (const [uid, list] of byUser) {
    const tz = list[0].tz || "America/Cancun";
    const { date, min } = localNow(tz);

    const { data: row } = await sb.from("stoic_data").select("planner").eq("user_id", uid).maybeSingle();
    const reminders: any[] = row?.planner?.reminders ?? [];

    const since = new Date(Date.now() - 3 * 86400000).toISOString();
    const { data: sent } = await sb.from("push_sent").select("key").eq("user_id", uid).gte("sent_at", since);
    const sentSet = new Set((sent ?? []).map((s: any) => s.key));

    const due = reminders.filter((r) => {
      if (r.done || r.due !== date || !/^\d{1,2}:\d{2}$/.test(r.time || "")) return false;
      const [h, m] = r.time.split(":").map(Number);
      const at = h * 60 + m;
      return at <= min && min - at <= WINDOW_MIN && !sentSet.has(`${r.id}|${r.due}|${r.time}`);
    });

    for (const r of due) {
      const key = `${r.id}|${r.due}|${r.time}`;
      const payload = JSON.stringify({
        title: `🕐 ${r.time}`,
        body: String(r.title || "").slice(0, 160),
        tag: `stoic-${r.id}`,
        url: "./",
      });
      let delivered = 0;
      const results: any[] = [];
      for (const s of list) {
        if (dry) { results.push({ endpoint: s.endpoint.slice(0, 40), dry: true }); continue; }
        try {
          const res = await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
            { TTL: 3600, urgency: "high" },
          );
          delivered++;
          results.push({ endpoint: s.endpoint.slice(0, 40), status: res.statusCode });
        } catch (e: any) {
          results.push({ endpoint: s.endpoint.slice(0, 40), error: e?.statusCode ?? String(e) });
          // The device is gone (app removed, permission revoked): forget it.
          if (e?.statusCode === 404 || e?.statusCode === 410) {
            await sb.from("push_subs").delete().eq("endpoint", s.endpoint);
          }
        }
      }
      if (!dry && delivered > 0) {
        await sb.from("push_sent").upsert({ user_id: uid, key }, { onConflict: "user_id,key" });
      }
      report.push({ title: r.title, time: r.time, results });
    }

    if (!dry) {
      await sb.from("push_sent").delete().eq("user_id", uid)
        .lt("sent_at", new Date(Date.now() - 7 * 86400000).toISOString());
    }
  }

  return Response.json({ ok: true, dry, users: byUser.size, sent: report });
});
