#!/usr/bin/env node
import { readFileSync } from "node:fs";

const expectedCrons = new Map([
  ["/api/internal/proving-heartbeat", "* * * * *"],
  ["/api/internal/nodeodm-upload", "2-59/5 * * * *"],
  ["/api/internal/nodeodm-poll", "*/5 * * * *"],
]);

const files = ["vercel.json", "web/vercel.json"];
const failures = [];

function readCrons(file) {
  const payload = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(payload.crons)) {
    failures.push(`${file}: crons must be an array`);
    return new Map();
  }

  return new Map(
    payload.crons.map((cron) => [String(cron.path ?? ""), String(cron.schedule ?? "")]),
  );
}

for (const file of files) {
  const actual = readCrons(file);

  for (const [path, schedule] of expectedCrons) {
    const actualSchedule = actual.get(path);
    if (actualSchedule !== schedule) {
      failures.push(
        `${file}: expected ${path} schedule ${JSON.stringify(schedule)}, got ${JSON.stringify(actualSchedule)}`,
      );
    }
  }

  for (const path of actual.keys()) {
    if (!expectedCrons.has(path)) {
      failures.push(`${file}: unexpected cron path ${path}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Vercel cron config drift detected:");
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log("Vercel cron configs match expected internal routes.");
