const fs = require("fs");

const required = [
  "package.json",
  "apps/web/package.json",
  "packages/api-client/package.json",
  "apps/mobile/package.json",
];

for (const path of required) {
  if (!fs.existsSync(path)) {
    console.error(`Incomplete deploy upload: missing ${path}`);
    process.exit(1);
  }
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.workspaces) {
  console.error("Incomplete deploy upload: root package.json has no workspaces");
  process.exit(1);
}