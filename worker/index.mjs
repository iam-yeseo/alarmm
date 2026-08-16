import { onRequest as handleBusArrivals } from "./bus-arrivals.mjs";

function jsonNotFound() {
  return Response.json({
    error: { code: "NOT_FOUND", message: "요청한 API 경로를 찾을 수 없습니다." },
  }, {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/bus-arrivals") {
      return handleBusArrivals({ request, env });
    }
    if (url.pathname.startsWith("/api/")) return jsonNotFound();
    return env.ASSETS.fetch(request);
  },
};
