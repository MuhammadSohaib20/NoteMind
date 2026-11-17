/**
 * Cloudflare Worker in front of the NoteMind frontend.
 *
 * Two jobs:
 *   1. Serve the built Vite bundle from ./dist (SPA fallback for client routes).
 *   2. Proxy /api/* and /health to the Express API, so the browser only ever
 *      talks to one origin. That keeps `BASE_URL = '/api/v1'` in
 *      client/src/api/client.ts working unchanged and avoids CORS entirely.
 *
 * API_ORIGIN (Worker variable or secret) is the public base URL of the API,
 * for example https://notemind-api.onrender.com — no trailing slash needed.
 */

type AssetFetcher = {
  fetch(request: Request): Promise<Response>;
};

export interface Env {
  ASSETS: AssetFetcher;
  API_ORIGIN?: string;
}

const API_PATHS = ["/api", "/health"] as const;

function isApiPath(pathname: string): boolean {
  return API_PATHS.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Static assets (and client-side routes, via SPA fallback).
    if (!isApiPath(url.pathname)) {
      return env.ASSETS.fetch(request);
    }

    if (!env.API_ORIGIN) {
      return json(
        {
          error: "api_not_configured",
          message:
            "The NoteMind API is not connected yet. Set API_ORIGIN on the " +
            "`notemind` Worker to the public URL of the Express API.",
        },
        503,
      );
    }

    let origin: URL;
    try {
      origin = new URL(env.API_ORIGIN);
    } catch {
      return json(
        {
          error: "api_origin_invalid",
          message: "API_ORIGIN must be an absolute http(s) URL.",
        },
        500,
      );
    }

    const target = new URL(url.pathname + url.search, origin);

    // Reuse the original request so methods, headers and streamed bodies
    // (uploads, SSE) pass through untouched.
    const proxied = new Request(target.toString(), request);
    proxied.headers.set("X-Forwarded-Host", url.host);
    proxied.headers.set("X-Forwarded-Proto", url.protocol.replace(":", ""));

    return fetch(proxied);
  },
};
