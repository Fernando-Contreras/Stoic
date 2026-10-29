// Erases the signed-in person's account and everything of theirs, on request.
//
// A web page cannot delete a user: that takes the service role, which must never
// be in a page. So the app calls this function with the person's own session
// token; it checks who that is, removes that person's rows, and only then removes
// the account. Nobody else's data is touched: every delete is filtered by the id
// the token proves, never by anything the caller sends (the body is ignored).
//
// Order matters. Data first, account last: if the data cannot be fully removed,
// the account is left alone and the person can try again, instead of an account
// that is gone with rows left behind that nobody can ever reach or remove.
//
// Secrets provided by Supabase itself: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Nothing to set up. Deploy once: supabase functions deploy delete-account
// (or paste this file into the dashboard's Edge Functions editor).
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Every table that holds something per person, keyed by user_id. A table that
// does not exist in this project is simply skipped.
const TABLES = ["stoic_data", "stoic_backups", "push_subs", "push_sent", "procrastination_time"];

const reply = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

export async function handle(req, admin) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Método no permitido." }, 405);

  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return reply({ error: "No has iniciado sesión." }, 401);

  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data || !data.user) return reply({ error: "Sesión no válida." }, 401);
  const uid = data.user.id;

  const failed = [];
  for (const table of TABLES) {
    const { error: e } = await admin.from(table).delete().eq("user_id", uid);
    if (e && !/does not exist|schema cache|could not find|relation/i.test(e.message || "")) failed.push(table);
  }
  if (failed.length) {
    return reply({ error: "No se pudieron borrar tus datos (" + failed.join(", ") + "). Tu cuenta no se tocó; intenta otra vez." }, 500);
  }

  const { error: delErr } = await admin.auth.admin.deleteUser(uid);
  if (delErr) return reply({ error: "Se borraron tus datos pero no la cuenta. Intenta otra vez." }, 500);
  return reply({ ok: true });
}

if (typeof Deno !== "undefined" && Deno.serve) {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL"),
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );
  Deno.serve((req) => handle(req, admin));
}
