$ErrorActionPreference = "Stop"

@'
const fs = require("fs");
const path = require("path");
const code = fs.readFileSync("server.js", "utf8");
const fn = new Function("require", "__dirname", "__filename", "module", "exports", code);
const moduleShim = { exports: {} };
fn(require, process.cwd(), path.join(process.cwd(), "server.js"), moduleShim, moduleShim.exports);
'@ | node -
