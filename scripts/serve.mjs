#!/usr/bin/env node
// Dependency-free static server for the last completed Quarto build.

import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, stat } from "node:fs/promises";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(process.env.SITE_DIR || join(here, "..", "_site"));
let port = Number(process.env.PORT || 4200);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

const server = createServer(async (request, response) => {
  try {
    let pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (pathname.endsWith("/")) pathname += "index.html";

    const target = normalize(join(root, pathname));
    if (target !== root && !target.startsWith(`${root}/`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }

    const info = await stat(target).catch(() => null);
    const file = info?.isDirectory() ? join(target, "index.html") : target;
    const body = await readFile(file);
    const dynamic = file.endsWith(".html") || file.endsWith("search.json");

    response.writeHead(200, {
      "content-type": types[extname(file)] || "application/octet-stream",
      "cache-control": dynamic ? "no-cache" : "public, max-age=604800, immutable",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("404 Not Found. Run `npm run build` first.");
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE" && process.env.PORT === undefined) {
    port += 1;
    server.close(() => server.listen(port));
    return;
  }
  throw error;
});

server.listen(port, () => {
  console.log(`Serving ${root} at http://localhost:${port}`);
});
