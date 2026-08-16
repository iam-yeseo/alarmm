"use strict";

var assert = require("node:assert/strict");
var core = require("../vacation-core.js");

function balance(hireDate, referenceDate, vacations) {
  return core.calculateBalance(hireDate, vacations || [], referenceDate);
}

assert.equal(balance("2026-01-15", "2026-02-14").granted, 0, "한 달 개근 전에는 월차가 없다");
assert.equal(balance("2026-01-15", "2026-02-15").granted, 1, "한 달 경과일에 월차 1일이 발생한다");
assert.equal(balance("2026-01-15", "2026-12-15").granted, 11, "첫해 월차는 최대 11일이다");

assert.equal(balance("2026-01-15", "2027-01-15").granted, 15, "첫 입사기념일에는 연차 15일이 발생한다");
assert.equal(balance("2023-01-15", "2026-01-15").granted, 16, "3년차에는 가산 연차 1일이 붙는다");
assert.equal(balance("2000-01-15", "2026-01-15").granted, 25, "가산 연차는 25일을 넘지 않는다");

var currentCycleVacations = [
  { date: "2026-03-02", type: "full" },
  { date: "2026-04-03", type: "half" },
  { date: "2026-05-04", type: "quarter" },
  { date: "2026-06-05", type: "health" },
  { date: "2026-07-06", type: "bereavement" }
];
var partialBalance = balance("2025-01-15", "2026-08-14", currentCycleVacations);
assert.equal(partialBalance.used, 1.75, "연차·반차·반반차만 차감한다");
assert.equal(partialBalance.remaining, 13.25, "0.25일 단위 잔여를 유지한다");
assert.equal(core.getVacationUnits({ type: "birthday" }), 0.5, "생일 반차는 일정상 0.5일이다");
assert.equal(core.isChargeableVacation({ type: "birthday" }), false, "생일 반차는 연차 잔여에서 차감하지 않는다");
assert.equal(core.isChargeableVacation({ type: "hour" }), true, "시간 휴가는 잔여 휴가에서 차감한다");
assert.equal(core.getVacationUnits({ type: "hour", units: 0.38 }), 0.38, "시간 휴가의 계산 단위를 유지한다");
assert.equal(
  core.calculateTimedVacationUnits("09:00", "11:00", {
    startTime: "09:00", endTime: "18:00", workHours: 8, lunchEnabled: true, lunchStart: "12:00", lunchEnd: "13:00"
  }),
  0.25,
  "2시간 휴가는 8시간 근무일의 0.25일이다"
);
assert.equal(
  core.calculateTimedVacationUnits("11:00", "14:00", {
    startTime: "09:00", endTime: "18:00", workHours: 8, lunchEnabled: true, lunchStart: "12:00", lunchEnd: "13:00"
  }),
  0.25,
  "시간 휴가 계산에서 점심시간을 제외한다"
);

var timedSettings = {
  startTime: "09:00", endTime: "18:00", workHours: 8, lunchEnabled: true, lunchStart: "12:00", lunchEnd: "13:00"
};
assert.equal(
  core.calculateVacationRangeDayUnits({
    index: 0, total: 1, startPeriod: "day", endPeriod: "am",
    startTime: "09:00", endTime: "12:00", settings: timedSettings
  }),
  0.5,
  "오전 선택은 실제 시각 간격과 관계없이 반차로 차감한다"
);
assert.equal(
  core.calculateVacationRangeDayUnits({
    index: 0, total: 2, startPeriod: "pm", endPeriod: "am",
    startTime: "13:00", endTime: "18:00", settings: timedSettings
  }),
  0.5,
  "여러 날 휴가의 첫 오후는 반차로 차감한다"
);
assert.equal(
  core.calculateVacationRangeDayUnits({
    index: 1, total: 2, startPeriod: "pm", endPeriod: "am",
    startTime: "09:00", endTime: "12:00", settings: timedSettings
  }),
  0.5,
  "여러 날 휴가의 마지막 오전은 반차로 차감한다"
);

var priorCycleVacation = [{ date: "2025-12-01", type: "full" }];
assert.equal(
  balance("2025-01-15", "2026-08-14", priorCycleVacation).used,
  0,
  "이전 사용기간의 휴가는 현재 잔여에서 다시 차감하지 않는다"
);

var advancedVacations = Array.from({ length: 16 }, function (_, index) {
  return { date: "2026-" + padMonth(index + 1) + "-15", type: "full" };
});
function padMonth(value) {
  return String(((value - 1) % 12) + 1).padStart(2, "0");
}
assert.equal(
  balance("2025-01-01", "2026-08-14", advancedVacations).remaining,
  -1,
  "당겨쓰기를 허용하면 잔여 계산은 마이너스 단위를 보존한다"
);

console.log("vacation-core: 19 assertions passed");
