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
  const key = String(value || "").trim();
  if (!key) return "";
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
  const headerCode = readXmlTag(xml, "headerCd");
  const headerMessage = readXmlTag(xml, "headerMsg");
  if (headerCode && headerCode !== "0") {
    const error = new Error(headerMessage || "서울시 버스 API 요청에 실패했습니다.");
    error.code = `SEOUL_BUS_${headerCode}`;
    throw error;
  }

  const routeFilter = new Set(normalizeRoutes(stop.routes));
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
  });
}
