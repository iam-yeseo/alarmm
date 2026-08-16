import assert from "node:assert/strict";
import {
  completeRouteArrivals,
  normalizeServiceKey,
  parseArrivalSeconds,
  parseBusXml,
  parseRouteArrivalXml,
  parseStopConfig,
} from "../bus-api-core.mjs";

assert.equal(normalizeServiceKey("abc%2B123%3D"), "abc+123=", "인코딩 키를 한 번만 복원한다");
assert.equal(normalizeServiceKey('"abc%2B123%3D"'), "abc+123=", "대시보드에 따옴표와 함께 입력한 키도 정규화한다");
assert.equal(
  normalizeServiceKey("https://example.test?serviceKey=abc%2B123%3D&arsId=04540"),
  "abc+123=",
  "전체 요청 URL을 붙여넣어도 인증키만 추출한다",
);
assert.equal(parseArrivalSeconds("150", "2분 30초후"), 150, "초 단위 원본 값을 우선한다");
assert.equal(parseArrivalSeconds("", "3분 12초후"), 192, "메시지에서도 분초를 계산한다");

const xml = `<?xml version="1.0"?><ServiceResult><msgHeader><headerCd>0</headerCd></msgHeader><msgBody>
<itemList><arsId>04210</arsId><stNm>성수2가3동주민센터</stNm><rtNm>302</rtNm><nxtStn>제인병원</nxtStn><traTime1>150</traTime1><traTime2>430</traTime2><arrmsg1>2분 30초후</arrmsg1><arrmsg2>7분 10초후</arrmsg2><routeType>3</routeType></itemList>
<itemList><arsId>04210</arsId><stNm>성수2가3동주민센터</stNm><rtNm>2012</rtNm><nxtStn>제인병원</nxtStn><traTime1>95</traTime1><arrmsg1>1분 35초후</arrmsg1></itemList>
</msgBody></ServiceResult>`;

const parsed = parseBusXml(xml, { arsId: "04210", direction: "", routes: ["302"] });
assert.equal(parsed.length, 1, "설정한 노선만 반환한다");
assert.equal(parsed[0].direction, "제인병원 방면", "다음 정류장으로 방면 문구를 만든다");
assert.equal(parsed[0].firstSeconds, 150, "첫 버스 도착 초를 유지한다");
assert.equal(parsed[0].secondSeconds, 430, "두 번째 버스 도착 초를 유지한다");

const ordered = parseBusXml(xml, { arsId: "04210", direction: "제인병원 방면", routes: ["2012", "302", "2222"] });
assert.deepEqual(ordered.map((arrival) => arrival.routeName), ["2012", "302"], "화면에 지정한 노선 순서로 정렬한다");
const completed = completeRouteArrivals(
  [{ arsId: "04210", direction: "제인병원 방면", routes: ["302", "2012", "2222"] }],
  ordered,
);
assert.deepEqual(completed.map((arrival) => arrival.routeName), ["302", "2012", "2222"], "세 개 퇴근 노선을 항상 노출한다");
assert.equal(completed[2].firstMessage, "현재 운행 정보 없음", "도착 응답이 없는 노선은 운행 상태를 표시한다");

const routeArrival = parseRouteArrivalXml(`<?xml version="1.0"?><ServiceResult><msgHeader><headerCd>0</headerCd></msgHeader><msgBody>
<itemList><arsId>04210</arsId><stId>103000111</stId><stNm>성수2가3동주민센터</stNm><rtNm>302</rtNm><routeType>3</routeType><dir>성동세무서</dir><traTime1>150</traTime1><traTime2>430</traTime2><arrmsg1>2분 30초후</arrmsg1><arrmsg2>7분 10초후</arrmsg2></itemList>
</msgBody></ServiceResult>`, {
  arsId: "04210",
  stationName: "성수2가3동주민센터",
  routeName: "302",
  routeType: "3",
  direction: "제인병원 방면",
});
assert.equal(routeArrival.length, 1, "노선별 도착정보 응답을 한 개의 화면 항목으로 변환한다");
assert.equal(routeArrival[0].routeName, "302", "노선명을 유지한다");
assert.equal(routeArrival[0].direction, "제인병원 방면", "화면에 지정한 방면 문구를 우선한다");
assert.equal(routeArrival[0].firstSeconds, 150, "노선별 첫 버스 도착 초를 변환한다");
assert.equal(routeArrival[0].secondSeconds, 430, "노선별 두 번째 버스 도착 초를 변환한다");
assert.deepEqual(
  parseRouteArrivalXml("<ServiceResult><msgHeader><headerCd>0</headerCd></msgHeader><msgBody /></ServiceResult>", {
    arsId: "04210",
    stationName: "성수2가3동주민센터",
    routeName: "302",
    routeType: "3",
    direction: "제인병원 방면",
  }),
  [],
  "도착 항목이 없는 정상 응답은 빈 배열로 처리한다",
);

assert.throws(
  () => parseBusXml("<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>20</returnReasonCode><returnAuthMsg>SERVICE ACCESS DENIED ERROR.</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>", { arsId: "04540", routes: [] }),
  /SERVICE ACCESS DENIED/,
  "공공데이터포털 인증 오류 형식도 감지한다",
);
assert.throws(
  () => parseRouteArrivalXml("<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>20</returnReasonCode><returnAuthMsg>SERVICE ACCESS DENIED ERROR.</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>", { arsId: "04540", routeName: "성동10" }),
  /SERVICE ACCESS DENIED/,
  "노선별 조회에서도 공공데이터포털 인증 오류를 감지한다",
);

const fallback = [{ arsId: "04210", direction: "제인병원 방면", routes: ["302"] }];
assert.equal(parseStopConfig("", fallback), fallback, "환경 변수가 없으면 기본 정류소를 쓴다");
assert.deepEqual(
  parseStopConfig('[{"arsId":"04540","routes":["성동10"]}]', fallback),
  [{ arsId: "04540", direction: "", routes: ["성동10"] }],
  "정류소 JSON을 검증하고 정규화한다",
);
assert.throws(() => parseStopConfig('[{"arsId":"12"}]', fallback), /5자리/, "잘못된 정류소 번호를 거부한다");

console.log("bus-api-core: passed");
