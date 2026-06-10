import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const assets = join(process.cwd(), "dist", "assets");
const files = await readdir(assets);
const limits = { ".js": 850_000, ".css": 200_000 };
const failures = [];

for (const file of files) {
  const extension = Object.keys(limits).find((suffix) => file.endsWith(suffix));
  if (!extension) continue;
  const bytes = (await stat(join(assets, file))).size;
  if (bytes > limits[extension]) failures.push(`${file}: ${bytes} > ${limits[extension]} bytes`);
}

if (failures.length) {
  console.error(`Bundle budget exceeded:\n${failures.join("\n")}`);
  process.exit(1);
}
console.log("Bundle budgets passed.");
