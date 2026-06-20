#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read
/**
 * Fixture runner for external-mentor-search.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... AUTH_TOKEN=... \
 *     deno run supabase/functions/external-mentor-search/__fixtures__/run-fixtures.ts
 *
 * Pass --baseline to write baseline/*.json, otherwise diffs against baseline.
 */
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const AUTH_TOKEN = Deno.env.get("AUTH_TOKEN") ?? "";
const writeBaseline = Deno.args.includes("--baseline");

if (!SUPABASE_URL || !AUTH_TOKEN) {
  console.error("Set SUPABASE_URL and AUTH_TOKEN (user JWT) to run fixtures.");
  Deno.exit(1);
}

const fixturePath = new URL("./queries.json", import.meta.url);
const queries = JSON.parse(await Deno.readTextFile(fixturePath)) as Array<{
  id: string;
  body: Record<string, unknown>;
}>;

const baselineDir = new URL("./baseline/", import.meta.url);

async function invoke(body: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/external-mentor-search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

let failures = 0;

for (const q of queries) {
  console.log(`\n=== ${q.id} ===`);
  const { status, data } = await invoke(q.body);
  const mentors = Array.isArray(data?.mentors) ? data.mentors : [];
  console.log(`status=${status} count=${mentors.length} reason=${data?.reason ?? data?.error ?? ""}`);

  if (writeBaseline) {
    await Deno.mkdir(baselineDir.pathname, { recursive: true });
    await Deno.writeTextFile(
      new URL(`${q.id}.json`, baselineDir),
      JSON.stringify(data, null, 2),
    );
    continue;
  }

  try {
    const baselineRaw = await Deno.readTextFile(new URL(`${q.id}.json`, baselineDir));
    const baseline = JSON.parse(baselineRaw);
    const baseCount = Array.isArray(baseline?.mentors) ? baseline.mentors.length : 0;
    if (mentors.length === 0 && baseCount > 0) {
      console.warn(`WARN: count collapsed to 0 (baseline had ${baseCount})`);
      failures++;
    }
  } catch {
    console.warn("No baseline file — run with --baseline first");
  }
}

console.log(failures ? `\n${failures} fixture(s) failed` : "\nFixtures OK");
Deno.exit(failures ? 1 : 0);
