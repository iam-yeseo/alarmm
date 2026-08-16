import assert from "node:assert/strict";
import {
  normalizeServiceKey,
  parseArrivalSeconds,
  parseBusXml,
  parseStopConfig,
} from "../bus-api-core.mjs";

assert.equal(normalizeServiceKey("abc%2B123%3D"), "abc+123=", "인코딩 키를 한 번만 복원한다");
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

const fallback = [{ arsId: "04210", direction: "제인병원 방면", routes: ["302"] }];
assert.equal(parseStopConfig("", fallback), fallback, "환경 변수가 없으면 기본 정류소를 쓴다");
assert.deepEqual(
  parseStopConfig('[{"arsId":"04540","routes":["성동10"]}]', fallback),
  [{ arsId: "04540", direction: "", routes: ["성동10"] }],
  "정류소 JSON을 검증하고 정규화한다",
);
assert.throws(() => parseStopConfig('[{"arsId":"12"}]', fallback), /5자리/, "잘못된 정류소 번호를 거부한다");

console.log("bus-api-core: 10 assertions passed");
