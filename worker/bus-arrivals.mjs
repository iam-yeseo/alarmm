import {
  completeRouteArrivals,
  normalizeServiceKey,
  parseBusXml,
  parseStopConfig,
} from "../bus-api-core.mjs";

const DEFAULT_STOPS = {
  commute: [
    { arsId: "04540", direction: "성수SKV1센터1동 방면", routes: ["성동10"] },
  ],
  home: [
    { arsId: "04210", direction: "제인병원 방면", routes: ["302", "2012", "2222"] },
  ],
};

function jsonResponse(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": status === 200
        ? "public, max-age=10, s-maxage=20, stale-while-revalidate=15"
        : "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Data-Source": "Seoul Bus Open API",
    },
  });
}

async function readTextWithinLimit(response, byteLimit) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let byteLength = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > byteLimit) {
      await reader.cancel("response exceeded byte limit");
      throw new Error("서울시 버스 API 응답이 예상 크기를 초과했습니다.");
    }
    text += decoder.decode(value, { stream: true });
  }

  return text + decoder.decode();
}

async function fetchStopArrivals(stop, apiKey) {
  const url = new URL("http://ws.bus.go.kr/api/rest/stationinfo/getStationByUid");
  url.searchParams.set("serviceKey", apiKey);
  url.searchParams.set("arsId", stop.arsId);

  const response = await fetch(url, {
    headers: { Accept: "application/xml" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`서울시 버스 API가 HTTP ${response.status}로 응답했습니다.`);

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > 2_000_000) throw new Error("서울시 버스 API 응답이 예상 크기를 초과했습니다.");
  return parseBusXml(await readTextWithinLimit(response, 2_000_000), stop);
}

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  const mode = requestUrl.searchParams.get("mode") || "commute";
  if (!Object.hasOwn(DEFAULT_STOPS, mode)) {
    return jsonResponse({ error: { code: "INVALID_MODE", message: "지원하지 않는 버스 조회 모드입니다." } }, 400);
  }

  const apiKey = normalizeServiceKey(context.env.SEOUL_BUS_API_KEY);
  if (!apiKey) {
    return jsonResponse({
      error: {
        code: "MISSING_API_KEY",
        message: "Cloudflare에 SEOUL_BUS_API_KEY 암호화 변수를 등록해주세요.",
      },
    }, 503);
  }

  try {
    const variableName = mode === "commute" ? "BUS_COMMUTE_STOPS_JSON" : "BUS_HOME_STOPS_JSON";
    const stops = parseStopConfig(context.env[variableName], DEFAULT_STOPS[mode]);
    const settled = await Promise.allSettled(stops.map((stop) => fetchStopArrivals(stop, apiKey)));
    const arrivals = [];
    const failures = [];

    settled.forEach((result, index) => {
      if (result.status === "fulfilled") arrivals.push(...result.value);
      else failures.push({ arsId: stops[index].arsId, message: String(result.reason?.message || result.reason) });
    });

    if (!arrivals.length && failures.length === stops.length) {
      console.error(JSON.stringify({ message: "all bus upstream requests failed", mode, failures }));
      const authenticationFailure = failures.find((failure) => /Key인증실패|SERVICE ACCESS DENIED|인증모듈|등록되지 않은 인증키/i.test(failure.message));
      return jsonResponse({
        error: authenticationFailure
          ? {
              code: "UPSTREAM_AUTH_ERROR",
              message: "서울시 버스 API 인증을 확인해주세요. 공공데이터포털의 버스도착정보조회 서비스 활용 상태와 인증키를 확인해주세요.",
            }
          : { code: "UPSTREAM_ERROR", message: "실시간 버스 정보를 불러오지 못했습니다." },
      }, 502);
    }

    if (failures.length) {
      console.warn(JSON.stringify({ message: "some bus upstream requests failed", mode, failures }));
    }

    return jsonResponse({
      mode,
      fetchedAt: new Date().toISOString(),
      source: "서울특별시 버스운행정보 공유서비스",
      arrivals: completeRouteArrivals(stops, arrivals).slice(0, 5),
    });
  } catch (error) {
    console.error(JSON.stringify({
      message: "bus arrivals request failed",
      mode,
      error: error instanceof Error ? error.message : String(error),
    }));
    return jsonResponse({
      error: { code: "BUS_API_ERROR", message: "실시간 버스 정보를 처리하지 못했습니다." },
    }, 500);
  }
}

export function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  return jsonResponse({ error: { code: "METHOD_NOT_ALLOWED", message: "GET 요청만 지원합니다." } }, 405);
}
