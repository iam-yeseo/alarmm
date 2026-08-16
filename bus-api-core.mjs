const XML_ENTITIES = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  quot: '"',
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
export function decodeXml(value) {
  return String(value || "")
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1")
    .replace(/&#(x?[0-9a-f]+);/gi, (_match, code) => {
      const radix = code[0].toLowerCase() === "x" ? 16 : 10;
      const point = Number.parseInt(radix === 16 ? code.slice(1) : code, radix);
      return Number.isFinite(point) ? String.fromCodePoint(point) : "";
    })
    .replace(/&([a-z]+);/gi, (match, name) => XML_ENTITIES[name] || match)
    .trim();
}

export function readXmlTag(xml, tagName) {
  const tag = escapeRegExp(tagName);
  const match = String(xml || "").match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

export function normalizeServiceKey(value) {
  let key = String(value || "").replace(/^\uFEFF/, "").trim();
  if (!key) return "";

  const parameterMatch = key.match(/(?:^|[?&])serviceKey=([^&]+)/i);
  if (parameterMatch) key = parameterMatch[1];
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }

  try {
    return decodeURIComponent(key);
  } catch (_error) {
    return key;
  }
}

export function parseArrivalSeconds(rawValue, message) {
  const numeric = Number.parseInt(String(rawValue || ""), 10);
  if (Number.isFinite(numeric) && numeric >= 0) return numeric;

  const text = String(message || "");
  if (/곧\s*도착|도착\s*예정/.test(text)) return 0;
  const minutes = text.match(/(\d+)\s*분/);
  const seconds = text.match(/(\d+)\s*초/);
  if (!minutes && !seconds) return null;
  return Number(minutes?.[1] || 0) * 60 + Number(seconds?.[1] || 0);
}

function normalizeRoutes(routes) {
  return Array.isArray(routes)
    ? routes.map((route) => String(route || "").replace(/\s+/g, "")).filter(Boolean).slice(0, 10)
    : [];
}

export function parseStopConfig(rawValue, fallback) {
  if (!rawValue) return fallback;
  let parsed;
  try {
    parsed = JSON.parse(rawValue);
  } catch (_error) {
    throw new Error("정류소 환경 변수는 올바른 JSON 배열이어야 합니다.");
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("정류소 환경 변수에는 한 개 이상의 정류소가 필요합니다.");
  }

  return parsed.slice(0, 5).map((stop) => {
    const arsId = String(stop?.arsId || "").trim();
    if (!/^\d{5}$/.test(arsId)) throw new Error("arsId는 5자리 서울시 정류소 번호여야 합니다.");
    return {
      arsId,
      direction: String(stop?.direction || "").trim(),
      routes: normalizeRoutes(stop?.routes),
    };
  });
}

export function parseBusXml(xml, stop) {
  const headerCode = readXmlTag(xml, "headerCd") || readXmlTag(xml, "returnReasonCode") || readXmlTag(xml, "resultCode");
  const headerMessage = readXmlTag(xml, "headerMsg") || readXmlTag(xml, "returnAuthMsg") || readXmlTag(xml, "resultMsg") || readXmlTag(xml, "errMsg");
  if (headerCode && headerCode !== "0" && headerCode !== "00") {
    const error = new Error(headerMessage || "서울시 버스 API 요청에 실패했습니다.");
    error.code = `SEOUL_BUS_${headerCode}`;
    throw error;
  }

  const routeOrder = normalizeRoutes(stop.routes);
  const routeFilter = new Set(routeOrder);
  const blocks = String(xml || "").match(/<itemList>[\s\S]*?<\/itemList>/gi) || [];
  return blocks.flatMap((block) => {
    const routeName = readXmlTag(block, "rtNm");
    const normalizedRoute = routeName.replace(/\s+/g, "");
    if (routeFilter.size && !routeFilter.has(normalizedRoute)) return [];

    const firstMessage = readXmlTag(block, "arrmsg1");
    const secondMessage = readXmlTag(block, "arrmsg2");
    const nextStop = readXmlTag(block, "nxtStn");
    const stationName = readXmlTag(block, "stNm");
    return [{
      id: `${stop.arsId}-${routeName}`,
      arsId: stop.arsId,
      stationName,
      routeName,
      routeType: readXmlTag(block, "routeType"),
      direction: stop.direction || (nextStop ? `${nextStop} 방면` : stationName),
      firstMessage,
      secondMessage,
      firstSeconds: parseArrivalSeconds(readXmlTag(block, "traTime1"), firstMessage),
      secondSeconds: parseArrivalSeconds(readXmlTag(block, "traTime2"), secondMessage),
    }];
  }).sort((left, right) => {
    const leftIndex = routeOrder.indexOf(left.routeName.replace(/\s+/g, ""));
    const rightIndex = routeOrder.indexOf(right.routeName.replace(/\s+/g, ""));
    return (leftIndex < 0 ? routeOrder.length : leftIndex) - (rightIndex < 0 ? routeOrder.length : rightIndex);
  });
}

export function parseRouteArrivalXml(xml, target) {
  const headerCode = readXmlTag(xml, "headerCd") || readXmlTag(xml, "returnReasonCode") || readXmlTag(xml, "resultCode");
  const headerMessage = readXmlTag(xml, "headerMsg") || readXmlTag(xml, "returnAuthMsg") || readXmlTag(xml, "resultMsg") || readXmlTag(xml, "errMsg");
  if (headerCode && headerCode !== "0" && headerCode !== "00") {
    const error = new Error(headerMessage || "서울시 버스 API 요청에 실패했습니다.");
    error.code = `SEOUL_BUS_${headerCode}`;
    throw error;
  }

  const block = String(xml || "").match(/<itemList>[\s\S]*?<\/itemList>/i)?.[0];
  if (!block) return [];

  const firstMessage = readXmlTag(block, "arrmsg1");
  const secondMessage = readXmlTag(block, "arrmsg2");
  const routeName = readXmlTag(block, "rtNm") || target.routeName;
  const stationName = readXmlTag(block, "stNm") || target.stationName;
  const apiDirection = readXmlTag(block, "dir");

  return [{
    id: `${target.arsId}-${routeName}`,
    arsId: target.arsId,
    stationName,
    routeName,
    routeType: readXmlTag(block, "routeType") || target.routeType,
    direction: target.direction || (apiDirection ? `${apiDirection} 방면` : stationName),
    firstMessage,
    secondMessage,
    firstSeconds: parseArrivalSeconds(readXmlTag(block, "traTime1"), firstMessage),
    secondSeconds: parseArrivalSeconds(readXmlTag(block, "traTime2"), secondMessage),
  }];
}

export function completeRouteArrivals(stops, arrivals) {
  const byStopAndRoute = new Map(
    (Array.isArray(arrivals) ? arrivals : []).map((arrival) => [
      `${arrival.arsId}-${String(arrival.routeName || "").replace(/\s+/g, "")}`,
      arrival,
    ]),
  );

  return (Array.isArray(stops) ? stops : []).flatMap((stop) => {
    const routes = normalizeRoutes(stop.routes);
    if (!routes.length) {
      return (Array.isArray(arrivals) ? arrivals : []).filter((arrival) => arrival.arsId === stop.arsId);
    }
    return routes.map((routeName) => byStopAndRoute.get(`${stop.arsId}-${routeName}`) || {
      id: `${stop.arsId}-${routeName}`,
      arsId: stop.arsId,
      stationName: "",
      routeName,
      routeType: routeName.startsWith("성동") ? "2" : routeName.length <= 3 ? "3" : "4",
      direction: stop.direction,
      firstMessage: "현재 운행 정보 없음",
      secondMessage: "다음 도착 정보 없음",
      firstSeconds: null,
      secondSeconds: null,
    });
  });
}
