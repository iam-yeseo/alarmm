import assert from "node:assert/strict";
import { onRequestGet } from "../worker/bus-arrivals.mjs";

const missingKeyResponse = await onRequestGet({
  request: new Request("https://alarmm.example/api/bus-arrivals?mode=commute"),
  env: {},
});
assert.equal(missingKeyResponse.status, 503, "API 키가 없으면 설정 안내 응답을 반환한다");
assert.equal((await missingKeyResponse.json()).error.code, "MISSING_API_KEY");

const invalidModeResponse = await onRequestGet({
  request: new Request("https://alarmm.example/api/bus-arrivals?mode=other"),
  env: {},
});
assert.equal(invalidModeResponse.status, 400, "지원하지 않는 모드는 거부한다");

const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.protocol, "http:");
    assert.equal(url.hostname, "ws.bus.go.kr");
    assert.equal(url.searchParams.get("serviceKey"), "encoded+key");
    assert.equal(url.searchParams.get("arsId"), "04540");
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>
      <ServiceResult>
        <msgHeader><headerCd>0</headerCd><headerMsg>정상 처리되었습니다.</headerMsg></msgHeader>
        <msgBody><itemList>
          <arsId>04540</arsId><stNm>성수역</stNm><rtNm>성동10</rtNm><routeType>5</routeType>
          <arrmsg1>2분 10초 후</arrmsg1><traTime1>130</traTime1>
          <arrmsg2>7분 5초 후</arrmsg2><traTime2>425</traTime2>
        </itemList></msgBody>
      </ServiceResult>`, {
      status: 200,
      headers: { "Content-Type": "application/xml" },
    });
  };

  const successResponse = await onRequestGet({
    request: new Request("https://alarmm.example/api/bus-arrivals?mode=commute"),
    env: { SEOUL_BUS_API_KEY: "encoded%2Bkey" },
  });
  const body = await successResponse.json();
  assert.equal(successResponse.status, 200);
  assert.equal(body.mode, "commute");
  assert.equal(body.arrivals.length, 1);
  assert.equal(body.arrivals[0].routeName, "성동10");
  assert.equal(body.arrivals[0].firstSeconds, 130);
  assert.equal(body.arrivals[0].secondSeconds, 425);

  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    globalThis.fetch = async () => new Response(new Uint8Array(2_000_001), { status: 200 });
    const oversizedResponse = await onRequestGet({
      request: new Request("https://alarmm.example/api/bus-arrivals?mode=commute"),
      env: { SEOUL_BUS_API_KEY: "key" },
    });
    assert.equal(oversizedResponse.status, 502, "크기 헤더가 없는 과대 응답도 제한한다");
    assert.equal((await oversizedResponse.json()).error.code, "UPSTREAM_ERROR");
  } finally {
    console.error = originalConsoleError;
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log("bus-api-function: 15 assertions passed");
