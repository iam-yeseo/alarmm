(function (root, factory) {
  "use strict";

  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AlarmmCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function parseDateId(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
    var parts = value.split("-").map(Number);
    var date = new Date(parts[0], parts[1] - 1, parts[2]);
    if (
      date.getFullYear() !== parts[0] ||
      date.getMonth() !== parts[1] - 1 ||
      date.getDate() !== parts[2]
    ) {
      return null;
    }
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function localDateId(date) {
    return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join("-");
  }

  function addMonths(date, months) {
    var result = new Date(date.getFullYear(), date.getMonth(), 1);
    result.setMonth(result.getMonth() + months);
    var lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
    result.setDate(Math.min(date.getDate(), lastDay));
    result.setHours(0, 0, 0, 0);
    return result;
  }

  function serviceYears(hireDate, referenceDate) {
    var years = referenceDate.getFullYear() - hireDate.getFullYear();
    if (addMonths(hireDate, years * 12) > referenceDate) years -= 1;
    return Math.max(0, years);
  }

  function roundUnits(value) {
    return Math.round(Number(value || 0) * 100) / 100;
  }

  function getEntitlement(hireDateId, referenceValue) {
    var hireDate = parseDateId(hireDateId);
    var referenceDate =
      referenceValue instanceof Date
        ? new Date(referenceValue.getFullYear(), referenceValue.getMonth(), referenceValue.getDate())
        : parseDateId(referenceValue);

    if (!hireDate || !referenceDate || referenceDate < hireDate) {
      return {
        eligible: false,
        label: "휴가",
        granted: 0,
        periodStart: "",
        periodEnd: "",
        nextGrantDate: ""
      };
    }

    var firstAnniversary = addMonths(hireDate, 12);
    if (referenceDate < firstAnniversary) {
      var completedMonths = 0;
      for (var month = 1; month <= 11; month += 1) {
        if (addMonths(hireDate, month) <= referenceDate) completedMonths = month;
      }
      return {
        eligible: true,
        label: "월차",
        granted: completedMonths,
        periodStart: localDateId(hireDate),
        periodEnd: localDateId(firstAnniversary),
        nextGrantDate:
          completedMonths < 11 ? localDateId(addMonths(hireDate, completedMonths + 1)) : "",
        serviceYears: 0
      };
    }

    var years = serviceYears(hireDate, referenceDate);
    var anniversary = addMonths(hireDate, years * 12);
    var nextAnniversary = addMonths(hireDate, (years + 1) * 12);
    return {
      eligible: true,
      label: "연차",
      granted: Math.min(25, 15 + Math.floor((years - 1) / 2)),
      periodStart: localDateId(anniversary),
      periodEnd: localDateId(nextAnniversary),
      nextGrantDate: localDateId(nextAnniversary),
      serviceYears: years
    };
  }

  function isChargeableVacation(vacation) {
    return ["full", "half", "quarter"].indexOf(vacation && vacation.type) !== -1;
  }

  function getVacationUnits(vacation) {
    if (!vacation) return 0;
    if (vacation.type === "full") return 1;
    if (vacation.type === "half") return 0.5;
    if (vacation.type === "quarter") return 0.25;
    return 0;
  }

  function calculateBalance(hireDateId, vacations, referenceValue) {
    var entitlement = getEntitlement(hireDateId, referenceValue);
    if (!entitlement.eligible) {
      return Object.assign({}, entitlement, { used: 0, remaining: 0 });
    }

    var used = (Array.isArray(vacations) ? vacations : []).reduce(function (total, vacation) {
      if (!isChargeableVacation(vacation)) return total;
      if (vacation.date < entitlement.periodStart || vacation.date >= entitlement.periodEnd) {
        return total;
      }
      return total + getVacationUnits(vacation);
    }, 0);

    used = roundUnits(used);
    return Object.assign({}, entitlement, {
      used: used,
      remaining: roundUnits(entitlement.granted - used)
    });
  }

  return {
    addMonths: addMonths,
    calculateBalance: calculateBalance,
    getEntitlement: getEntitlement,
    getVacationUnits: getVacationUnits,
    isChargeableVacation: isChargeableVacation,
    localDateId: localDateId,
    parseDateId: parseDateId,
    roundUnits: roundUnits
  };
});
