#!/usr/bin/env node
// Creates the three test users via the Supabase Admin API (service-role key).
// Run once before seed.sql:
//   node supabase/create-test-users.js

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse .env.local manually (no dotenv dependency needed)
const envPath = resolve(__dirname, "../.env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const url     = env.NEXT_PUBLIC_SUPABASE_URL;
const svcKey  = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !svcKey) {
  console.error(
    "Missing env vars.\n" +
    "Add SUPABASE_SERVICE_ROLE_KEY to .env.local\n" +
    "(find it in Supabase dashboard → Project Settings → API → service_role key)"
  );
  process.exit(1);
}

const supabase = createClient(url, svcKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const users = [
  { email: "admin@splitshift.test",   password: "Test1234!", name: "Test Admin"  },
  { email: "worker1@splitshift.test", password: "Test1234!", name: "Alice Worker" },
  { email: "worker2@splitshift.test", password: "Test1234!", name: "Bob Worker"   },
];

for (const u of users) {
  const { data, error } = await supabase.auth.admin.createUser({
    email:            u.email,
    password:         u.password,
    email_confirm:    true,
    user_metadata:    { full_name: u.name },
  });

  if (error) {
    if (error.message?.includes("already been registered")) {
      console.log(`⚠  ${u.email} already exists — skipping`);
    } else {
      console.error(`✗  ${u.email}: ${error.message}`);
    }
  } else {
    console.log(`✓  ${u.email} created (${data.user.id})`);
  }
}

console.log("\nDone. Now run seed.sql in the Supabase SQL editor.");
