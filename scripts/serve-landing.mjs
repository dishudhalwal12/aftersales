#!/usr/bin/env node
/**
 * Static server for the mirrored landing page in `public/landing`.
 *
 * Why this exists: the mirror is a saved WordPress page whose asset filenames
 * keep the original query string (`bootstrap.min_ver%3D7.1.4.css`). A browser
 * URL-decodes the request path, so it only resolves when something serves the
 * directory over HTTP — opening `index.html` from the filesystem leaves the
 * page unstyled. This is that something, with no dependencies.
 *
 *   npm run landing              # http://localhost:8080/
 *   LANDING_PORT=9000 npm run landing
 *
 * Paths are served under `/landing/...` as well as at the root, because the
 * page references its assets from the site root and Next.js serves the same
 * files that way in production.
 */

import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../public/landing/", import.meta.url));
const PORT = Number(process.env.LANDING_PORT ?? 8080);

const MIME = new Map(
  Object.entries({
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".ttf": "font/ttf",
    ".otf": "font/otf",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".eot": "application/vnd.ms-fontobject",
    ".pdf": "application/pdf",
    ".xml": "application/xml; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
  }),
);

/** Map a request path to a file inside ROOT, or null when it must not be served. */
async function resolveFile(requestPath) {
  let decoded;
  try {
    // `%3D` in the saved asset names must become `=` before hitting the disk.
    decoded = decodeURIComponent(requestPath);
  } catch {
    return null; // malformed percent-encoding
  }

  if (decoded.includes("\0")) return null;
  const relative = normalize(decoded).replace(/^[/\\]+/, "");
  if (relative.split(/[/\\]/).includes("..")) return null;

  const target = join(ROOT, relative === "" ? "index.html" : relative);
  if (!target.startsWith(ROOT)) return null;

  try {
    const info = await stat(target);
    if (info.isFile()) return { file: target, size: info.size };
    if (!info.isDirectory()) return null;

    const index = join(target, "index.html");
    const indexInfo = await stat(index);
    return indexInfo.isFile() ? { file: index, size: indexInfo.size } : null;
  } catch {
    return null;
  }
}

/** Minimal single-range support so the hero <video> can seek and show duration. */
function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header ?? "");
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return null;

  const start = rawStart === "" ? Math.max(0, size - Number(rawEnd)) : Number(rawStart);
  const end = rawStart === "" || rawEnd === "" ? size - 1 : Math.min(size - 1, Number(rawEnd));
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null;
  return { start, end };
}

const server = createServer(async (req, res) => {
  const method = req.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" }).end("Method Not Allowed");
    return;
  }

  const { pathname } = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  // Production serves these same files at `/landing/...`; accept both so the
  // replica behaves the same whether Next or this script is in front of it.
  const found = await resolveFile(pathname.replace(/^\/landing(?=\/|$)/, ""));
  if (!found) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`404 Not Found: ${decodeURIComponent(pathname)}\n`);
    return;
  }

  const type = MIME.get(extname(found.file).toLowerCase()) ?? "application/octet-stream";
  const headers = {
    "Content-Type": type,
    "Cache-Control": "no-cache",
    "Accept-Ranges": "bytes",
    "Last-Modified": (await stat(found.file)).mtime.toUTCString(),
  };

  const range = method === "GET" ? parseRange(req.headers.range, found.size) : null;
  if (range) {
    res.writeHead(206, {
      ...headers,
      "Content-Range": `bytes ${range.start}-${range.end}/${found.size}`,
      "Content-Length": String(range.end - range.start + 1),
    });
    if (method === "HEAD") return void res.end();
    createReadStream(found.file, { start: range.start, end: range.end }).pipe(res);
    return;
  }

  res.writeHead(200, { ...headers, "Content-Length": String(found.size) });
  if (method === "HEAD") return void res.end();
  createReadStream(found.file).pipe(res);
});

server.listen(PORT, () => {
  console.log(`landing replica serving ${ROOT}`);
  console.log(`  http://localhost:${PORT}/`);
});
