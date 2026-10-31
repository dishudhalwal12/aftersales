#!/usr/bin/env node
// One public door for two laptop services.
//   /baileys/* -> http://127.0.0.1:3001/*
//   /laya/*    -> http://127.0.0.1:8100/*
// ngrok exposes this on one HTTPS dev domain, so Vercel needs one URL, not two.

import http from "node:http";

const PORT = Number(process.env.GATEWAY_PORT ?? 8080);
const ROUTES = [
  { prefix: "/baileys", target: { host: "127.0.0.1", port: 3001 } },
  { prefix: "/laya", target: { host: "127.0.0.1", port: 8100 } },
];

function routeFor(url) {
  return ROUTES.find((route) => url === route.prefix || url.startsWith(`${route.prefix}/`));
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "aftersales-tunnel-gateway" }));
    return;
  }

  const route = routeFor(req.url ?? "");
  if (!route) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "unknown tunnel path" }));
    return;
  }

  const targetPath = (req.url ?? "").slice(route.prefix.length) || "/";
  const headers = { ...req.headers, host: `${route.target.host}:${route.target.port}` };
  delete headers["x-forwarded-for"];
  delete headers["x-forwarded-proto"];

  const upstream = http.request(
    { ...route.target, method: req.method, path: targetPath, headers },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );

  upstream.on("error", (error) => {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: `upstream ${route.prefix} unreachable`, detail: error.message }));
  });

  req.pipe(upstream);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`tunnel gateway listening on http://127.0.0.1:${PORT}`);
  for (const route of ROUTES) {
    console.log(`  ${route.prefix}/* -> http://${route.target.host}:${route.target.port}/*`);
  }
});
