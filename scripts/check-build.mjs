// Fails the build when social-card URLs in dist/index.html are not absolute https URLs.
// Crawlers (X, Facebook, Slack, ...) ignore relative og:image paths, so a relative URL means no preview image.
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");
const checks = [
  ["property", "og:url"],
  ["property", "og:image"],
  ["name", "twitter:image"],
];
const problems = [];
for (const [attribute, key] of checks) {
  const match = html.match(new RegExp(`<meta ${attribute}="${key}" content="([^"]*)"`));
  if (!match) problems.push(`${key}: missing`);
  else if (!/^https:\/\/[^/]+\//.test(match[1])) problems.push(`${key}: "${match[1]}" is not an absolute https URL`);
}
if (problems.length > 0) {
  console.error("Social card check failed:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log("Social card URLs are absolute.");
