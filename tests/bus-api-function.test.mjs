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
    assert.equal(url.pathname, "/api/rest/arrive/getArrInfoByRoute");
    assert.equal(url.searchParams.get("serviceKey"), "encoded+key");
    assert.equal(url.searchParams.get("stId"), "103900298");
    assert.equal(url.searchParams.get("busRouteId"), "103900008");
    assert.equal(url.searchParams.get("ord"), "19");
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

  const homeTargets = new Map([
    ["100100052", { routeName: "302", ord: "75", routeType: "3", firstSeconds: 150 }],
    ["100100186", { routeName: "2012", ord: "71", routeType: "4", firstSeconds: 95 }],
    ["100100199", { routeName: "2222", ord: "49", routeType: "4", firstSeconds: 210 }],
  ]);
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const target = homeTargets.get(url.searchParams.get("busRouteId"));
    assert.ok(target, "퇴근길에 지정된 세 노선만 조회한다");
    assert.equal(url.pathname, "/api/rest/arrive/getArrInfoByRoute");
    assert.equal(url.searchParams.get("stId"), "103000111");
    assert.equal(url.searchParams.get("ord"), target.ord);
    return new Response(`<?xml version="1.0"?><ServiceResult>
      <msgHeader><headerCd>0</headerCd><headerMsg>정상 처리되었습니다.</headerMsg></msgHeader>
      <msgBody><itemList>
        <arsId>04210</arsId><stId>103000111</stId><stNm>성수2가3동주민센터</stNm>
        <rtNm>${target.routeName}</rtNm><routeType>${target.routeType}</routeType>
        <arrmsg1>${target.firstSeconds}초 후</arrmsg1><traTime1>${target.firstSeconds}</traTime1>
        <arrmsg2>다음 도착 정보 없음</arrmsg2>
      </itemList></msgBody>
    </ServiceResult>`, { status: 200, headers: { "Content-Type": "application/xml" } });
  };
  const homeResponse = await onRequestGet({
    request: new Request("https://alarmm.example/api/bus-arrivals?mode=home"),
    env: { SEOUL_BUS_API_KEY: "encoded%2Bkey" },
  });
  const homeBody = await homeResponse.json();
  assert.equal(homeResponse.status, 200);
  assert.deepEqual(homeBody.arrivals.map((arrival) => arrival.routeName), ["302", "2012", "2222"]);
  assert.deepEqual(homeBody.arrivals.map((arrival) => arrival.firstSeconds), [150, 95, 210]);
  assert.deepEqual(homeBody.arrivals.map((arrival) => arrival.routeType), ["3", "4", "4"]);

  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    globalThis.fetch = async () => new Response(`<?xml version="1.0"?><ServiceResult>
      <msgHeader><headerCd>20</headerCd><headerMsg>Key인증실패: SERVICE ACCESS DENIED ERROR.[인증모듈 에러코드(20)]</headerMsg></msgHeader>
    </ServiceResult>`, { status: 200 });
    const authenticationResponse = await onRequestGet({
      request: new Request("https://alarmm.example/api/bus-arrivals?mode=commute"),
      env: { SEOUL_BUS_API_KEY: "key" },
    });
    assert.equal(authenticationResponse.status, 502, "상위 API 인증 실패를 구분한다");
    assert.equal((await authenticationResponse.json()).error.code, "UPSTREAM_AUTH_ERROR");

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

console.log("bus-api-function: passed");
