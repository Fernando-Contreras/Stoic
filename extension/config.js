/* The same project and the same PUBLIC key index.html carries (role "anon":
   it is meant to ship in pages, and what a signed-in person may read or write is
   decided by the database's row rules, not by this key). Nothing secret is in
   this folder: the session lives only in the browser's extension storage. */
export const SUPABASE_URL='https://qupukwwpebnawbtdbibs.supabase.co';
export const SUPABASE_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1cHVrd3dwZWJuYXdidGRiaWJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNDQ0MDgsImV4cCI6MjA5NjcyMDQwOH0.IuQgej-fGMIDVuXOR0jjH_YgrTJJtRZKsKRPfZScCZY';
export const STOIC_URL='https://fernando-contreras.github.io/Stoic/';

// How often it asks. Chrome and Edge allow an alarm every 30 seconds.
export const CHECK_EVERY_MIN=0.5;
// If the cloud cannot be reached, a block already in force stands for this long.
export const OFFLINE_GRACE_MS=10*60*1000;
