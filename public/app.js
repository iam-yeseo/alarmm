(function () {
  "use strict";

  var SETTINGS_KEY = "alarmm-settings-v1";
  var HISTORY_KEY = "alarmm-history-v1";
  var ATTENDANCE_KEY = "alarmm-attendance-v1";
  var VACATION_KEY = "alarmm-vacations-v1";
  var MINUTE_MS = 60 * 1000;
  var core = window.AlarmmCore;

  if (!core) throw new Error("AlarmmCore를 불러오지 못했습니다.");

  var defaultSettings = {
    startTime: "09:00",
    endTime: "18:00",
    workHours: 8,
    lunchEnabled: true,
    lunchStart: "12:00",
    lunchEnd: "13:00",
    lunchMinutes: 60,
    overtimeEnabled: false,
    overtimeEndTime: "20:00",
    includeOvertimeInProgress: true,
    freeWorkEnabled: false,
    hireDate: "",
    birthday: "",
    allowVacationAdvance: false,
    expireUnusedVacation: false
  };

  var $ = function (id) {
    return document.getElementById(id);
  };

  function loadJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function saveJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  function loadSettings() {
    return Object.assign({}, defaultSettings, loadJson(SETTINGS_KEY, {}));
  }

  function loadHistory() {
    var history = loadJson(HISTORY_KEY, []);
    return Array.isArray(history) ? history : [];
  }

  function loadAttendance() {
    var attendance = loadJson(ATTENDANCE_KEY, {});
    return attendance && typeof attendance === "object" ? attendance : {};
  }

  function loadVacations() {
    var vacations = loadJson(VACATION_KEY, []);
    return Array.isArray(vacations) ? vacations : [];
  }

  function parseTime(value) {
    if (!/^\d{2}:\d{2}$/.test(value || "")) return 0;
    var parts = value.split(":");
    return Number(parts[0]) * 60 + Number(parts[1]);
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function formatTimeFromMinutes(totalMinutes) {
    var normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
    return pad(Math.floor(normalized / 60)) + ":" + pad(normalized % 60);
  }

  function formatTimeFromDate(date) {
    return pad(date.getHours()) + ":" + pad(date.getMinutes());
  }

  function offsetAfterStart(time, startTime) {
    var offset = parseTime(time) - parseTime(startTime);
    return offset < 0 ? offset + 1440 : offset;
  }

  function dateAtOffset(baseDate, startTime, offsetMinutes) {
    var date = new Date(baseDate);
    var startMinutes = parseTime(startTime);
    date.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
    return new Date(date.getTime() + offsetMinutes * MINUTE_MS);
  }

  function overlapMs(startA, endA, startB, endB) {
    return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
  }

  function activeDurationMs(start, end, lunchStart, lunchEnd, lunchEnabled) {
    var duration = Math.max(0, end - start);
    if (!lunchEnabled) return duration;
    return Math.max(0, duration - overlapMs(start, end, lunchStart, lunchEnd));
  }

  function isFullDayVacation(vacation) {
    return Boolean(
      vacation && ["full", "health", "bereavement", "other"].indexOf(vacation.type) !== -1
    );
  }

  function workSegments(schedule) {
    if (!schedule.lunchEnabled) return [[schedule.start, schedule.normalEnd]];
    return [
      [schedule.start, new Date(Math.min(schedule.normalEnd, schedule.lunchStart))],
      [new Date(Math.max(schedule.start, schedule.lunchEnd)), schedule.normalEnd]
    ].filter(function (segment) {
      return segment[1] > segment[0];
    });
  }

  function advanceActiveTime(schedule, milliseconds) {
    var remaining = milliseconds;
    var segments = workSegments(schedule);
    for (var index = 0; index < segments.length; index += 1) {
      var segmentLength = segments[index][1] - segments[index][0];
      if (remaining <= segmentLength) {
        return new Date(segments[index][0].getTime() + remaining);
      }
      remaining -= segmentLength;
    }
    return new Date(schedule.normalEnd);
  }

  function retreatActiveTime(schedule, milliseconds) {
    var remaining = milliseconds;
    var segments = workSegments(schedule).reverse();
    for (var index = 0; index < segments.length; index += 1) {
      var segmentLength = segments[index][1] - segments[index][0];
      if (remaining <= segmentLength) {
        return new Date(segments[index][1].getTime() - remaining);
      }
      remaining -= segmentLength;
    }
    return new Date(schedule.start);
  }

  function getSchedule(baseDate, settings, vacation) {
    var normalEndOffset = offsetAfterStart(settings.endTime, settings.startTime);
    if (normalEndOffset === 0) normalEndOffset = 1440;

    var lunchStartOffset = offsetAfterStart(settings.lunchStart, settings.startTime);
    var lunchEndOffset = offsetAfterStart(settings.lunchEnd, settings.startTime);
    if (lunchEndOffset <= lunchStartOffset) lunchEndOffset += 1440;

    var overtimeEndOffset = offsetAfterStart(settings.overtimeEndTime, settings.startTime);
    if (settings.overtimeEnabled && overtimeEndOffset <= normalEndOffset) overtimeEndOffset += 1440;

    var countdownEndOffset = settings.overtimeEnabled ? overtimeEndOffset : normalEndOffset;
    var progressEndOffset =
      settings.overtimeEnabled && settings.includeOvertimeInProgress
        ? overtimeEndOffset
        : normalEndOffset;

    var start = dateAtOffset(baseDate, settings.startTime, 0);
    var normalEnd = dateAtOffset(baseDate, settings.startTime, normalEndOffset);
    var countdownEnd = dateAtOffset(baseDate, settings.startTime, countdownEndOffset);
    var progressEnd = dateAtOffset(baseDate, settings.startTime, progressEndOffset);
    var lunchStart = dateAtOffset(baseDate, settings.startTime, lunchStartOffset);
    var lunchEnd = dateAtOffset(baseDate, settings.startTime, lunchEndOffset);

    var schedule = {
      start: start,
      normalEnd: normalEnd,
      countdownEnd: countdownEnd,
      progressEnd: progressEnd,
      lunchStart: lunchStart,
      lunchEnd: lunchEnd,
      normalEndOffset: normalEndOffset,
      countdownEndOffset: countdownEndOffset,
      progressEndOffset: progressEndOffset,
      lunchStartOffset: lunchStartOffset,
      lunchEndOffset: lunchEndOffset,
      lunchEnabled: settings.lunchEnabled,
      isFullLeave: isFullDayVacation(vacation),
      vacation: vacation || null
    };

    var vacationUnits = core.getVacationUnits(vacation);
    if (vacation && vacation.type === "hour" && vacation.startTime && vacation.endTime) {
      var requestedStart = dateAtOffset(baseDate, settings.startTime, offsetAfterStart(vacation.startTime, settings.startTime));
      var requestedEnd = dateAtOffset(baseDate, settings.startTime, offsetAfterStart(vacation.endTime, settings.startTime));
      if (requestedEnd <= requestedStart) requestedEnd = new Date(requestedEnd.getTime() + 1440 * MINUTE_MS);
      if (requestedStart <= schedule.start && requestedEnd < schedule.normalEnd) {
        schedule.start = requestedEnd;
      } else if (requestedEnd >= schedule.normalEnd && requestedStart > schedule.start) {
        schedule.normalEnd = requestedStart;
        schedule.countdownEnd = requestedStart;
        schedule.progressEnd = requestedStart;
      }
    } else if (vacationUnits > 0 && vacationUnits < 1) {
      var regularDuration = activeDurationMs(
        schedule.start,
        schedule.normalEnd,
        schedule.lunchStart,
        schedule.lunchEnd,
        schedule.lunchEnabled
      );
      var leaveDuration = regularDuration * vacationUnits;

      if (vacation.period === "pm") {
        var adjustedEnd = retreatActiveTime(schedule, leaveDuration);
        schedule.normalEnd = adjustedEnd;
        schedule.countdownEnd = adjustedEnd;
        schedule.progressEnd = adjustedEnd;
      } else {
        schedule.start = advanceActiveTime(schedule, leaveDuration);
      }
    }

    schedule.lunchEnabled = Boolean(
      settings.lunchEnabled &&
        schedule.lunchStart < schedule.countdownEnd &&
        schedule.lunchEnd > schedule.start
    );
    schedule.normalEndOffset = Math.max(0, (schedule.normalEnd - schedule.start) / MINUTE_MS);
    schedule.countdownEndOffset = Math.max(0, (schedule.countdownEnd - schedule.start) / MINUTE_MS);
    schedule.progressEndOffset = Math.max(0, (schedule.progressEnd - schedule.start) / MINUTE_MS);
    schedule.lunchStartOffset = (schedule.lunchStart - schedule.start) / MINUTE_MS;
    schedule.lunchEndOffset = (schedule.lunchEnd - schedule.start) / MINUTE_MS;
    return schedule;
  }

  function getProgress(now, schedule) {
    if (now <= schedule.start) return 0;
    if (now >= schedule.progressEnd) return 1;

    var total = activeDurationMs(
      schedule.start,
      schedule.progressEnd,
      schedule.lunchStart,
      schedule.lunchEnd,
      schedule.lunchEnabled
    );
    var elapsed = activeDurationMs(
      schedule.start,
      now,
      schedule.lunchStart,
      schedule.lunchEnd,
      schedule.lunchEnabled
    );
    return total > 0 ? Math.min(1, Math.max(0, elapsed / total)) : 1;
  }

  function getTimelineProgress(now, schedule) {
    var total = schedule.countdownEnd - schedule.start;
    if (total <= 0) return 0;
    return Math.min(1, Math.max(0, (now - schedule.start) / total));
  }

  function formatClock(date) {
    return [date.getHours(), date.getMinutes(), date.getSeconds()].map(pad).join(":");
  }

  function formatRemaining(milliseconds) {
    var totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
    var hours = Math.floor(totalSeconds / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = totalSeconds % 60;
    return pad(hours) + ":" + pad(minutes) + ":" + pad(seconds);
  }

  function formatDuration(minutes) {
    var safeMinutes = Math.max(0, Math.round(minutes));
    var hours = Math.floor(safeMinutes / 60);
    var rest = safeMinutes % 60;
    return hours + "시간 " + rest + "분";
  }

  function formatUnits(value) {
    return String(core.roundUnits(value));
  }

  function localDateId(date) {
    return core.localDateId(date);
  }

  function dateIdBefore(dateId) {
    var date = core.parseDateId(dateId);
    if (!date) return "";
    date.setDate(date.getDate() - 1);
    return localDateId(date);
  }

  function formatDateShort(dateId) {
    var date = core.parseDateId(dateId);
    if (!date) return "—";
    return date.getFullYear() + "." + pad(date.getMonth() + 1) + "." + pad(date.getDate());
  }

  function formatDateKorean(dateId) {
    var date = core.parseDateId(dateId);
    if (!date) return "—";
    return date.getFullYear() + "년 " + (date.getMonth() + 1) + "월 " + date.getDate() + "일";
  }

  function formatDateInput(dateId) {
    var date = core.parseDateId(dateId);
    if (!date) return "0000. 00. 00.";
    return date.getFullYear() + ". " + pad(date.getMonth() + 1) + ". " + pad(date.getDate()) + ".";
  }

  function formatDateLong(dateId) {
    var date = core.parseDateId(dateId);
    if (!date) return "";
    var weekdays = ["일", "월", "화", "수", "목", "금", "토"];
    return (
      date.getFullYear() +
      "년 " +
      (date.getMonth() + 1) +
      "월 " +
      date.getDate() +
      "일 (" +
      weekdays[date.getDay()] +
      ")"
    );
  }

  function isWeekend(date) {
    return core.isWeekend(date);
  }

  function findVacation(vacations, dateId) {
    var savedVacation = vacations.find(function (vacation) {
      return vacation.date === dateId;
    }) || null;
    if (savedVacation) return savedVacation;
    var birthday = loadSettings().birthday;
    if (birthday && dateId && birthday.slice(5) === dateId.slice(5)) {
      return {
        id: "birthday-" + dateId.slice(0, 4),
        date: dateId,
        type: "birthday",
        period: "pm",
        units: 0.5,
        automatic: true
      };
    }
    return null;
  }

  function getVacationLabel(vacation, settings) {
    if (!vacation) return "";
    var entitlement = core.getEntitlement(settings.hireDate, vacation.date);
    var annualLabel = entitlement.eligible ? entitlement.label : "연차";
    if (vacation.type === "full") return annualLabel + " 1일";
    if (vacation.type === "half") return (vacation.period === "pm" ? "오후" : "오전") + " 반차";
    if (vacation.type === "quarter") {
      return (vacation.period === "pm" ? "오후" : "오전") + " 반반차";
    }
    if (vacation.type === "hour") return "시간 휴가 " + formatUnits(core.getVacationUnits(vacation)) + "일";
    if (vacation.type === "health") return "보건 휴가";
    if (vacation.type === "bereavement") return "경조사 휴가";
    if (vacation.type === "other") return "기타 미차감 휴가";
    if (vacation.type === "birthday") return "생일 반차 0.5일";
    return "휴가";
  }

  function getVacationScheduleText(vacation, settings) {
    if (!vacation) return "";
    if (isFullDayVacation(vacation)) return "출퇴근 기록 없음";
    if (vacation.type === "hour" && vacation.startTime && vacation.endTime) {
      return vacation.startTime + " ~ " + vacation.endTime + " 사용";
    }
    var baseDate = core.parseDateId(vacation.date) || new Date();
    var schedule = getSchedule(baseDate, settings, vacation);
    return formatTimeFromDate(schedule.start) + " 출근 · " + formatTimeFromDate(schedule.countdownEnd) + " 퇴근";
  }

  function nextWeekdayStart(now, startTime, vacations) {
    var nonWorkingDateIds = (vacations || []).filter(isFullDayVacation).map(function (vacation) {
      return vacation.date;
    });
    return core.nextWorkdayStart(now, startTime, nonWorkingDateIds);
  }

  function formatNextWorkStart(date) {
    var weekdays = ["일", "월", "화", "수", "목", "금", "토"];
    return "다음 출근일은 " + (date.getMonth() + 1) + "월 " + date.getDate() + "일 (" +
      weekdays[date.getDay()] + ") " + formatTimeFromDate(date) + "이에요.";
  }

  function showToast(message) {
    var toast = $("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(function () {
      toast.classList.remove("show");
    }, 2200);
  }

  function initHome() {
    var settings = loadSettings();
    var history = loadHistory();
    var attendance = loadAttendance();
    var vacations = loadVacations();
    var showRemainingAsMain = false;
    var lastCalendarSignature = "";
    var dialogConfirmAction = null;
    var busState = {
      mode: "",
      arrivals: [],
      fetchedAt: 0,
      loading: false,
      error: ""
    };
    var BUS_REFRESH_MS = 30 * 1000;

    function closeAttendanceDialog() {
      $("attendanceDialog").hidden = true;
      dialogConfirmAction = null;
      $("workStateButton").focus();
    }

    function openAttendanceDialog(message, alertOnly, onConfirm) {
      $("attendanceDialogMessage").textContent = message;
      $("attendanceDialogCancel").hidden = alertOnly;
      $("attendanceDialog").querySelector(".dialog-actions").classList.toggle("single-action", alertOnly);
      dialogConfirmAction = onConfirm;
      $("attendanceDialog").hidden = false;
      $("attendanceDialogConfirm").focus();
    }

    function renderCalendar(now) {
      var todayId = localDateId(now);
      var signature = [
        todayId,
        Object.keys(attendance).sort().join(","),
        history.map(function (item) { return item.date; }).sort().join(","),
        vacations.map(function (item) { return item.date + item.type; }).sort().join(",")
      ].join("|");
      if (lastCalendarSignature === signature) return;
      lastCalendarSignature = signature;

      var weekdays = ["일", "월", "화", "수", "목", "금", "토"];
      var calendar = $("weekCalendar");
      var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      calendar.innerHTML = "";

      var weekStartOffset = -now.getDay();
      for (var index = 0; index < 7; index += 1) {
        var date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + weekStartOffset + index);
        var dateId = localDateId(date);
        var vacation = findVacation(vacations, dateId);
        var hasAttendance = Boolean(attendance[dateId] && attendance[dateId].clockInAt) || history.some(function (item) {
          return item.date === dateId;
        });
        var isPast = date < todayStart;
        var scheduledOff = isWeekend(date) || isFullDayVacation(vacation);
        var isOutline = (isPast && !hasAttendance) || (!isPast && scheduledOff);
        var status = hasAttendance
          ? "출근 기록 있음"
          : isPast
            ? "출근 기록 없음"
            : scheduledOff
              ? vacation ? getVacationLabel(vacation, settings) : "출근하지 않는 날"
              : "근무 예정";
        var item = document.createElement("li");
        item.className = "week-day";
        if (index === now.getDay()) item.classList.add("today");
        if (isOutline) item.classList.add("no-attendance");
        if (vacation) item.classList.add("vacation-date");
        item.setAttribute(
          "aria-label",
          (date.getMonth() + 1) + "월 " + date.getDate() + "일 " + weekdays[date.getDay()] + "요일, " + status
        );

        var weekday = document.createElement("small");
        weekday.textContent = weekdays[date.getDay()];
        var number = document.createElement("strong");
        number.textContent = date.getDate();
        var dot = document.createElement("i");
        dot.setAttribute("aria-hidden", "true");
        item.append(weekday, number, dot);
        calendar.appendChild(item);
      }
    }

    function getDayState(now, schedule) {
      if (schedule.isFullLeave) return "vacation";
      if (isWeekend(now)) return "weekend";
      if (now < schedule.start) return "before";
      if (
        schedule.lunchEnabled &&
        now >= schedule.lunchStart &&
        now < schedule.lunchEnd
      ) {
        return "lunch";
      }
      if (now >= schedule.countdownEnd) return "complete";
      if (settings.overtimeEnabled && now >= schedule.normalEnd) return "overtime";
      return "working";
    }

    function getRemainingTarget(now, schedule, state) {
      if (state === "weekend") return nextWeekdayStart(now, settings.startTime, vacations);
      if (state === "before") return schedule.start;
      return schedule.countdownEnd;
    }

    function getRemainingLabel(state) {
      return {
        weekend: "다음 출근까지",
        before: "출근까지 남은 시간",
        lunch: "퇴근까지 남은 시간",
        working: "퇴근까지 남은 시간",
        overtime: "야근 종료까지",
        complete: "오늘 근무 완료"
      }[state];
    }

    function getHeroProgress(now, schedule, state) {
      if (state === "vacation" || state === "weekend") return state === "vacation" ? 1 : 0;
      if (state === "before") {
        var dayStart = new Date(now);
        dayStart.setHours(0, 0, 0, 0);
        var preWorkDuration = schedule.start - dayStart;
        return preWorkDuration > 0
          ? Math.min(1, Math.max(0, (now - dayStart) / preWorkDuration))
          : 0;
      }
      if (state === "complete") return 1;
      return getTimelineProgress(now, schedule);
    }

    function renderGauge(progress) {
      if (window.AlarmmMotion && window.AlarmmMotion.updateGauge) {
        window.AlarmmMotion.updateGauge(progress);
        return;
      }

      var gauge = document.querySelector(".clock-gauge");
      var fill = $("arcDial");
      var dot = $("gaugeDot");
      if (!gauge || !fill || !dot) return;
      var safeProgress = Math.min(1, Math.max(0, progress));
      var width = gauge.getBoundingClientRect().width || 340;
      var endpointAngle = Math.asin(30.5 / 165);
      var startAngle = Math.PI + endpointAngle;
      var endAngle = -endpointAngle;
      var angle = startAngle + (endAngle - startAngle) * safeProgress;
      var x = (170 + 165 * Math.cos(angle)) * (width / 340) - 13;
      var y = 170 - 165 * Math.sin(angle) - 13;
      fill.style.strokeDashoffset = String(1 - safeProgress);
      fill.style.opacity = safeProgress > 0 ? "1" : "0";
      dot.style.transform = "translate3d(" + x + "px," + y + "px,0)";
    }

    function renderClock() {
      var now = new Date();
      var vacation = findVacation(vacations, localDateId(now));
      var schedule = getSchedule(now, settings, vacation);
      var state = getDayState(now, schedule);
      var isLeaveDay = state === "vacation";
      var progress = getHeroProgress(now, schedule, state);
      var timelineProgress = progress;

      $("todayVacationBanner").hidden = !vacation;
      if (vacation) {
        $("todayVacationTitle").textContent = getVacationLabel(vacation, settings);
        $("todayVacationSchedule").textContent = getVacationScheduleText(vacation, settings);
      }

      if (isLeaveDay) {
        $("clockLabel").textContent = "오늘은 " + getVacationLabel(vacation, settings);
        $("clockTime").textContent = showRemainingAsMain ? "휴가" : formatClock(now);
        $("clockSecondary").textContent = showRemainingAsMain
          ? "현재 시각  |  " + formatClock(now)
          : "출퇴근 기록 없이 쉬는 날이에요.";
      } else {
        var target = getRemainingTarget(now, schedule, state);
        var remaining = state === "complete" ? "00:00:00" : formatRemaining(target - now);
        var remainingLabel = getRemainingLabel(state);
        if (showRemainingAsMain) {
          $("clockLabel").textContent = remainingLabel;
          $("clockTime").textContent = remaining;
          $("clockSecondary").textContent = "현재 시각  |  " + formatClock(now);
        } else {
          $("clockLabel").textContent = "현재 시각";
          $("clockTime").textContent = formatClock(now);
          $("clockSecondary").textContent = remainingLabel + "  |  " + remaining;
        }
      }

      var percent = Math.round(progress * 100);
      renderGauge(progress);
      $("progressTitle").textContent = isLeaveDay ? "오늘은 " + getVacationLabel(vacation, settings) : "오늘 진행률";
      $("progressPercent").textContent = isLeaveDay ? "휴가" : percent + "%";
      $("timelineFill").style.width = timelineProgress * 100 + "%";

      var totalOffset = Math.max(1, schedule.countdownEndOffset);
      $("lunchStartMarker").style.left =
        Math.min(100, Math.max(0, (schedule.lunchStartOffset / totalOffset) * 100)) + "%";
      $("lunchEndMarker").style.left =
        Math.min(100, Math.max(0, (schedule.lunchEndOffset / totalOffset) * 100)) + "%";

      $("timelineStart").textContent = isLeaveDay ? "없음" : formatTimeFromDate(schedule.start);
      $("timelineEnd").textContent = isLeaveDay ? "없음" : formatTimeFromDate(schedule.countdownEnd);
      $("timelineEndLabel").textContent = settings.overtimeEnabled && !vacation ? "야근 종료" : "퇴근";
      $("timelineLunch").textContent = settings.lunchStart + "–" + settings.lunchEnd;
      $("timelineLunchWrap").hidden = isLeaveDay || !schedule.lunchEnabled;
      $("lunchStartMarker").hidden = isLeaveDay || !schedule.lunchEnabled;
      $("lunchEndMarker").hidden = isLeaveDay || !schedule.lunchEnabled;

      if ($("statusStart")) {
        var isNonWorkDay = isLeaveDay || state === "weekend";
        $("statusList").hidden = isNonWorkDay;
        $("statusDayOff").hidden = !isNonWorkDay;
        if (isNonWorkDay) {
          $("statusNextWork").textContent = formatNextWorkStart(nextWeekdayStart(now, settings.startTime, vacations));
        } else {
          $("statusStart").textContent = formatTimeFromDate(schedule.start) + ":00";
          $("statusLunch").textContent = schedule.lunchEnabled
            ? settings.lunchStart + " ~ " + settings.lunchEnd
            : "없음";
          $("statusEnd").textContent = formatTimeFromDate(schedule.countdownEnd) + ":00";
        }
      }

      if (vacation) $("attendanceMessage").textContent = "오늘은 " + getVacationLabel(vacation, settings) + " 사용일이에요.";
      renderWorkState(state, schedule, vacation);
      syncBusMode(now, schedule);
      updateBusCountdowns();
    }

    function setWorkButton(button, label, action, className) {
      $("workStateLabel").textContent = label;
      button.dataset.action = action || "";
      button.classList.remove("complete", "overtime", "check-in", "leave");
      if (className) button.classList.add(className);
      button.disabled = !action;
      button.setAttribute("aria-label", action === "checkout" ? "퇴근하기" : label);
    }

    function getTodayAttendance() {
      return attendance[localDateId(new Date())] || null;
    }

    function renderWorkState(state, schedule, vacation) {
      var button = $("workStateButton");
      var checkoutButton = $("checkoutButton");
      var saveButton = $("saveTodayButton");
      var recorded = history.some(function (item) {
        return item.date === localDateId(new Date());
      });
      var todayAttendance = getTodayAttendance();

      saveButton.hidden = true;
      checkoutButton.hidden = true;

      if (state === "vacation") {
        setWorkButton(button, getVacationLabel(vacation, settings) + " · 출퇴근 기록 없음", "", "leave");
      } else if (state === "weekend") {
        setWorkButton(button, "오늘은 출근하는 날이 아니에요", "", "");
      } else if (todayAttendance && todayAttendance.clockOutAt) {
        setWorkButton(button, "퇴근 완료", "", "complete");
      } else if (recorded) {
        setWorkButton(button, "오늘 근무기록 저장 완료", "", "complete");
      } else if (!todayAttendance || !todayAttendance.clockInAt) {
        var checkInLabel = vacation && state === "before"
          ? getVacationLabel(vacation, settings) + " · " + formatTimeFromDate(schedule.start) + " 출근"
          : "출근하기";
        setWorkButton(button, checkInLabel, "clock-in", "check-in");
      } else if (state === "overtime") {
        setWorkButton(button, "야근 중", "", "overtime");
        checkoutButton.hidden = false;
      } else {
        setWorkButton(button, "근무 중", "", "");
        checkoutButton.hidden = false;
      }

      button.dataset.minutes = Math.round(
        activeDurationMs(
          schedule.start,
          schedule.countdownEnd,
          schedule.lunchStart,
          schedule.lunchEnd,
          schedule.lunchEnabled
        ) / MINUTE_MS
      );
    }

    function saveAttendance() {
      saveJson(ATTENDANCE_KEY, attendance);
      lastCalendarSignature = "";
      renderCalendar(new Date());
    }

    function clockIn() {
      var now = new Date();
      var vacation = findVacation(vacations, localDateId(now));
      var schedule = getSchedule(now, settings, vacation);
      if (schedule.isFullLeave) return;
      var isLate = now > schedule.start;

      openAttendanceDialog(
        isLate ? "지각입니다. 빨리 출근하세요." : "출근하시겠습니까?",
        isLate,
        function () {
          var confirmedAt = new Date();
          attendance[localDateId(confirmedAt)] = {
            date: localDateId(confirmedAt),
            clockInAt: confirmedAt.toISOString(),
            clockOutAt: null,
            late: isLate,
            vacationId: vacation ? vacation.id : null
          };
          saveAttendance();
          renderClock();
          showToast(isLate ? "지각 출근으로 기록했어요." : "출근을 기록했어요.");
        }
      );
    }

    function clockOut() {
      var now = new Date();
      var vacation = findVacation(vacations, localDateId(now));
      var schedule = getSchedule(now, settings, vacation);
      var prompt =
        now < schedule.countdownEnd
          ? "아직 퇴근 시간이 경과하지 않았습니다. 정말 퇴근하시겠습니까?"
          : "퇴근하시겠습니까?";
      var today = localDateId(now);
      var record = attendance[today];
      if (!record || !record.clockInAt) return;

      openAttendanceDialog(prompt, false, function () {
        var confirmedAt = new Date();
        record.clockOutAt = confirmedAt.toISOString();
        var actualStart = Math.max(new Date(record.clockInAt).getTime(), schedule.start.getTime());
        var minutes = Math.round(
          activeDurationMs(
            actualStart,
            confirmedAt.getTime(),
            schedule.lunchStart.getTime(),
            schedule.lunchEnd.getTime(),
            schedule.lunchEnabled
          ) / MINUTE_MS
        );

        record.minutes = Math.max(0, minutes);
        saveAttendance();

        var existingHistory = history.find(function (item) {
          return item.date === today;
        });
        if (existingHistory) {
          existingHistory.minutes = record.minutes;
          existingHistory.savedAt = confirmedAt.toISOString();
        } else {
          history.push({ date: today, minutes: record.minutes, savedAt: confirmedAt.toISOString() });
        }
        saveJson(HISTORY_KEY, history);
        lastCalendarSignature = "";
        renderCalendar(new Date());
        renderHistory();
        renderClock();
        showToast("퇴근을 기록했어요.");
      });
    }

    function renderHistory() {
      var list = $("historyList");
      var recent = history
        .slice()
        .sort(function (a, b) {
          return b.date.localeCompare(a.date);
        })
        .slice(0, 5);

      $("historyCount").textContent = history.length + "개";
      $("attendanceMessage").textContent = history.length + 1 + "번째 Alarmm 출근이에요.";
      list.innerHTML = "";

      if (!recent.length) {
        var empty = document.createElement("div");
        empty.className = "history-empty";
        empty.innerHTML =
          "<strong>아직 저장된 기록이 없어요.</strong><span>퇴근 시간이 지나면 오늘 기록을 저장할 수 있어요.</span>";
        list.appendChild(empty);
        renderTotals();
        return;
      }

      var weekdays = ["일", "월", "화", "수", "목", "금", "토"];
      recent.forEach(function (record) {
        var date = new Date(record.date + "T00:00:00");
        var item = document.createElement("article");
        item.className = "history-item";
        item.innerHTML =
          "<div><time>" +
          date.getFullYear() +
          "년 " +
          (date.getMonth() + 1) +
          "월 " +
          date.getDate() +
          "일 (" +
          weekdays[date.getDay()] +
          ")</time><h3>근무 완료</h3></div><strong>" +
          formatDuration(record.minutes) +
          "</strong>";
        list.appendChild(item);
      });

      renderTotals();
    }

    function renderTotals() {
      var now = new Date();
      var year = now.getFullYear();
      var month = now.getMonth();
      var lastMonthDate = new Date(year, month - 1, 1);

      function sumFor(predicate) {
        return history.reduce(function (total, record) {
          var date = new Date(record.date + "T00:00:00");
          return predicate(date) ? total + Number(record.minutes || 0) : total;
        }, 0);
      }

      var monthMinutes = sumFor(function (date) {
        return date.getFullYear() === year && date.getMonth() === month;
      });
      var lastMonthMinutes = sumFor(function (date) {
        return (
          date.getFullYear() === lastMonthDate.getFullYear() &&
          date.getMonth() === lastMonthDate.getMonth()
        );
      });
      var yearMinutes = sumFor(function (date) {
        return date.getFullYear() === year;
      });

      $("monthTotal").textContent = formatDuration(monthMinutes);
      $("lastMonthTotal").textContent = formatDuration(lastMonthMinutes);
      $("yearTotal").textContent = formatDuration(yearMinutes);
      $("monthBar").style.width = Math.min(100, (monthMinutes / (160 * 60)) * 100) + "%";
      $("lastMonthBar").style.width =
        Math.min(100, (lastMonthMinutes / (160 * 60)) * 100) + "%";
      $("yearBar").style.width = Math.min(100, (yearMinutes / (1920 * 60)) * 100) + "%";
    }

    $("clockToggle").addEventListener("click", function () {
      showRemainingAsMain = !showRemainingAsMain;
      renderClock();
    });

    $("workStateButton").addEventListener("click", function () {
      var action = this.dataset.action;
      if (action === "clock-in") clockIn();
      if (action === "checkout") clockOut();
    });
    $("checkoutButton").addEventListener("click", clockOut);

    function busColorClass(arrival) {
      if (/^성동/.test(arrival.routeName)) return "bus-green";
      if (String(arrival.routeType) === "3") return "bus-blue";
      if (String(arrival.routeType) === "4") return "bus-lime";
      return "bus-red";
    }

    function formatBusCountdown(arrivalAt) {
      var seconds = Math.max(0, Math.ceil((arrivalAt - Date.now()) / 1000));
      if (seconds <= 0) return "곧 도착";
      return Math.floor(seconds / 60) + "분 " + pad(seconds % 60) + "초";
    }

    function renderBusMessage(title, description) {
      var list = $("busList");
      list.innerHTML = "";
      var item = document.createElement("article");
      item.className = "bus-item bus-message-item";
      var copy = document.createElement("div");
      var heading = document.createElement("strong");
      var detail = document.createElement("small");
      heading.textContent = title;
      detail.textContent = description;
      copy.append(heading, detail);
      item.appendChild(copy);
      list.appendChild(item);
    }

    function renderBusArrivals() {
      var list = $("busList");
      list.innerHTML = "";
      list.setAttribute("aria-busy", "false");

      if (!busState.arrivals.length) {
        renderBusMessage("도착 정보가 없어요", "잠시 후 자동으로 다시 확인할게요.");
        return;
      }

      busState.arrivals.forEach(function (arrival) {
        var item = document.createElement("article");
        item.className = "bus-item";
        var lineInfo = document.createElement("div");
        var direction = document.createElement("small");
        var route = document.createElement("strong");
        direction.textContent = arrival.direction || arrival.stationName || "정류소 방면";
        route.textContent = arrival.routeName || "—";
        route.className = busColorClass(arrival);
        lineInfo.append(direction, route);

        var estimate = document.createElement("div");
        var first = document.createElement("b");
        var second = document.createElement("small");
        if (Number.isFinite(arrival.firstSeconds)) {
          first.dataset.arrivalAt = String(busState.fetchedAt + arrival.firstSeconds * 1000);
        } else {
          first.dataset.fallback = arrival.firstMessage || "도착 정보 없음";
        }
        if (Number.isFinite(arrival.secondSeconds)) {
          second.dataset.arrivalAt = String(busState.fetchedAt + arrival.secondSeconds * 1000);
          second.dataset.prefix = "다음 버스 ";
        } else {
          second.dataset.fallback = arrival.secondMessage || "다음 도착 정보 없음";
        }
        estimate.append(first, second);
        item.append(lineInfo, estimate);
        list.appendChild(item);
      });
      updateBusCountdowns();
    }

    function updateBusCountdowns() {
      $("busList").querySelectorAll("[data-arrival-at], [data-fallback]").forEach(function (node) {
        var arrivalAt = Number(node.dataset.arrivalAt || 0);
        node.textContent = arrivalAt
          ? (node.dataset.prefix || "") + formatBusCountdown(arrivalAt)
          : node.dataset.fallback;
      });
    }

    async function fetchBusArrivals(mode) {
      if (!mode || busState.loading) return;
      busState.loading = true;
      $("busList").setAttribute("aria-busy", "true");
      try {
        var response = await fetch("./api/bus-arrivals?mode=" + encodeURIComponent(mode), {
          headers: { Accept: "application/json" }
        });
        var data = await response.json().catch(function () { return {}; });
        if (!response.ok) {
          throw new Error(data.error && data.error.message ? data.error.message : "실시간 버스 정보를 불러오지 못했습니다.");
        }
        if (busState.mode !== mode) return;
        busState.arrivals = Array.isArray(data.arrivals) ? data.arrivals : [];
        busState.fetchedAt = Date.parse(data.fetchedAt) || Date.now();
        busState.error = "";
        renderBusArrivals();
      } catch (error) {
        if (busState.mode !== mode) return;
        busState.arrivals = [];
        busState.error = error && error.message ? error.message : "실시간 버스 정보를 불러오지 못했습니다.";
        $("busList").setAttribute("aria-busy", "false");
        renderBusMessage("버스 정보를 확인할 수 없어요", busState.error);
      } finally {
        busState.loading = false;
        if (busState.mode && busState.mode !== mode) fetchBusArrivals(busState.mode);
      }
    }

    function syncBusMode(now, schedule) {
      var mode = now < schedule.start ? "commute" : "home";
      $("busTitle").textContent = mode === "commute" ? "출근길 버스" : "퇴근길 버스";
      if (busState.mode === mode) return;
      busState.mode = mode;
      busState.arrivals = [];
      busState.fetchedAt = 0;
      renderBusMessage("실시간 도착정보 확인 중", "서울시 버스 정보를 불러오고 있어요.");
      fetchBusArrivals(mode);
    }

    $("attendanceDialogCancel").addEventListener("click", closeAttendanceDialog);
    $("attendanceDialogConfirm").addEventListener("click", function () {
      var action = dialogConfirmAction;
      closeAttendanceDialog();
      if (action) action();
    });
    $("attendanceDialog").addEventListener("click", function (event) {
      if (event.target === this && !$("attendanceDialogCancel").hidden) {
        closeAttendanceDialog();
      }
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !$("attendanceDialog").hidden && !$("attendanceDialogCancel").hidden) {
        closeAttendanceDialog();
      }
    });

    $("saveTodayButton").addEventListener("click", function () {
      var today = localDateId(new Date());
      if (history.some(function (item) { return item.date === today; })) {
        showToast("오늘 기록은 이미 저장되어 있어요.");
        return;
      }

      history.push({
        date: today,
        minutes: Number($("workStateButton").dataset.minutes || 0),
        savedAt: new Date().toISOString()
      });
      saveJson(HISTORY_KEY, history);
      lastCalendarSignature = "";
      renderCalendar(new Date());
      renderHistory();
      renderClock();
      showToast("오늘 근무기록을 저장했어요.");
    });

    renderCalendar(new Date());
    renderHistory();
    renderClock();
    window.setInterval(function () {
      renderCalendar(new Date());
      renderClock();
    }, 1000);
    window.setInterval(function () {
      if (!document.hidden) fetchBusArrivals(busState.mode);
    }, BUS_REFRESH_MS);

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) {
        settings = loadSettings();
        history = loadHistory();
        attendance = loadAttendance();
        vacations = loadVacations();
        lastCalendarSignature = "";
        renderCalendar(new Date());
        renderHistory();
        renderClock();
        fetchBusArrivals(busState.mode);
      }
    });
    window.addEventListener("storage", function (event) {
      if (event.key !== SETTINGS_KEY) return;
      settings = loadSettings();
      renderClock();
      fetchBusArrivals(busState.mode);
    });
  }

  function initSettings() {
    var settings = loadSettings();
    var form = $("settingsForm");

    var fields = {
      startTime: $("startTime"),
      endTime: $("endTime"),
      workHours: $("workHours"),
      lunchEnabled: $("lunchEnabled"),
      lunchStart: $("lunchStart"),
      lunchEnd: $("lunchEnd"),
      lunchMinutes: $("lunchMinutes"),
      overtimeEnabled: $("overtimeEnabled"),
      overtimeEndTime: $("overtimeEndTime"),
      includeOvertimeInProgress: $("includeOvertimeInProgress"),
      freeWorkEnabled: $("freeWorkEnabled"),
      hireDate: $("hireDate"),
      birthday: $("birthday"),
      allowVacationAdvance: $("allowVacationAdvance"),
      expireUnusedVacation: $("expireUnusedVacation")
    };

    Object.keys(fields).forEach(function (key) {
      if (fields[key].type === "checkbox") fields[key].checked = Boolean(settings[key]);
      else fields[key].value = settings[key];
    });
    fields.hireDate.max = localDateId(new Date());
    fields.birthday.max = localDateId(new Date());
    var noFixedLunch = $("noFixedLunch");
    noFixedLunch.checked = !fields.lunchEnabled.checked;

    function readForm() {
      return {
        startTime: fields.startTime.value,
        endTime: fields.endTime.value,
        workHours: Math.max(1, Math.min(16, Number(fields.workHours.value || 8))),
        lunchEnabled: fields.lunchEnabled.checked,
        lunchStart: fields.lunchStart.value,
        lunchEnd: fields.lunchEnd.value,
        lunchMinutes: Math.max(0, Math.min(240, Number(fields.lunchMinutes.value || 0))),
        overtimeEnabled: fields.overtimeEnabled.checked,
        overtimeEndTime: fields.overtimeEndTime.value,
        includeOvertimeInProgress: fields.includeOvertimeInProgress.checked,
        freeWorkEnabled: fields.freeWorkEnabled.checked,
        hireDate: fields.hireDate.value,
        birthday: fields.birthday.value,
        allowVacationAdvance: fields.allowVacationAdvance.checked,
        expireUnusedVacation: fields.expireUnusedVacation.checked
      };
    }

    function updateEndFromWorkHours() {
      var workMinutes = Math.round(Math.max(1, Math.min(16, Number(fields.workHours.value || 8))) * 60);
      var breakMinutes = fields.lunchEnabled.checked
        ? Math.max(0, Math.min(240, Number(fields.lunchMinutes.value || 0)))
        : 0;
      fields.endTime.value = formatTimeFromMinutes(parseTime(fields.startTime.value) + workMinutes + breakMinutes);
    }

    function setDisabledStates() {
      var lunchDisabled = !fields.lunchEnabled.checked;
      noFixedLunch.checked = lunchDisabled;
      [fields.lunchStart, fields.lunchEnd, fields.lunchMinutes].forEach(function (field) {
        field.disabled = lunchDisabled;
      });
      $("lunchFields").classList.toggle("is-disabled", lunchDisabled);
      $("workSettingsCard").classList.toggle("is-free-work", fields.freeWorkEnabled.checked);

      var overtimeDisabled = !fields.overtimeEnabled.checked;
      [fields.overtimeEndTime, fields.includeOvertimeInProgress].forEach(function (field) {
        field.disabled = overtimeDisabled;
      });
      $("overtimeFields").classList.toggle("is-disabled", overtimeDisabled);
    }

    function updateLunchEndFromMinutes() {
      var minutes = Math.max(0, Math.min(240, Number(fields.lunchMinutes.value || 0)));
      fields.lunchMinutes.value = minutes;
      fields.lunchEnd.value = formatTimeFromMinutes(parseTime(fields.lunchStart.value) + minutes);
      updateEndFromWorkHours();
    }

    function updateLunchMinutesFromRange() {
      var minutes = offsetAfterStart(fields.lunchEnd.value, fields.lunchStart.value);
      fields.lunchMinutes.value = Math.min(240, minutes);
      updateEndFromWorkHours();
    }

    function validate(value) {
      if (!value.startTime || !value.endTime) return "근무 시작과 종료 시각을 모두 입력해주세요.";

      var normalEndOffset = offsetAfterStart(value.endTime, value.startTime);
      if (normalEndOffset === 0) return "근무 시작과 종료 시각은 달라야 해요.";

      if (value.lunchEnabled) {
        if (!value.lunchStart || !value.lunchEnd || value.lunchMinutes <= 0) {
          return "점심 시작, 종료, 분 단위를 모두 확인해주세요.";
        }
        var lunchStartOffset = offsetAfterStart(value.lunchStart, value.startTime);
        var lunchEndOffset = offsetAfterStart(value.lunchEnd, value.startTime);
        if (lunchEndOffset <= lunchStartOffset) lunchEndOffset += 1440;
        if (lunchStartOffset >= normalEndOffset || lunchEndOffset > normalEndOffset) {
          return "점심시간은 근무 시작과 종료 사이로 설정해주세요.";
        }
      }

      if (value.overtimeEnabled) {
        if (!value.overtimeEndTime) return "야근 종료 예정 시각을 입력해주세요.";
        var overtimeEndOffset = offsetAfterStart(value.overtimeEndTime, value.startTime);
        if (overtimeEndOffset <= normalEndOffset) overtimeEndOffset += 1440;
        if (overtimeEndOffset - normalEndOffset > 12 * 60) {
          return "야근 종료 시각은 정규 퇴근 후 12시간 안으로 설정해주세요.";
        }
      }

      if (value.hireDate && value.hireDate > localDateId(new Date())) {
        return "입사일은 오늘보다 미래일 수 없어요.";
      }
      return "";
    }

    function renderVacationSettings(value) {
      if (!value.hireDate) {
        $("vacationSettingsNote").textContent = "입사일자를 선택하면 휴가일수가 자동 계산되어 적용됩니다.";
        return;
      }
      var balance = core.calculateBalance(value.hireDate, loadVacations(), localDateId(new Date()));
      $("vacationSettingsNote").textContent =
        "현재 " + balance.label + " " + formatUnits(balance.granted) + "일 발생 · " +
        (value.allowVacationAdvance ? "마이너스 잔여 허용" : "보유 일수 안에서만 신청");
    }

    function renderSummary() {
      var value = readForm();
      var normalEndOffset = offsetAfterStart(value.endTime, value.startTime);
      if (normalEndOffset === 0) normalEndOffset = 1440;
      var lunchMinutes = value.lunchEnabled ? value.lunchMinutes : 0;
      var regularMinutes = Math.max(0, normalEndOffset - lunchMinutes);
      var overtimeMinutes = 0;

      if (value.overtimeEnabled) {
        var overtimeEndOffset = offsetAfterStart(value.overtimeEndTime, value.startTime);
        if (overtimeEndOffset <= normalEndOffset) overtimeEndOffset += 1440;
        overtimeMinutes = Math.max(0, overtimeEndOffset - normalEndOffset);
      }

      $("workDurationNote").textContent = "점심시간을 제외한 하루 총 근무시간을 입력해주세요.";
      $("lunchDurationNote").textContent = "총 점심 시간을 입력해주세요. 근로계약서 상 휴게 시간입니다.";
      $("overtimeDurationNote").textContent = value.overtimeEnabled
        ? "정규 퇴근 후 " + formatDuration(overtimeMinutes) + " 야근 예정이에요."
        : "야근을 사용하지 않아요.";

      $("summaryTitle").textContent =
        value.startTime + " — " + (value.overtimeEnabled ? value.overtimeEndTime : value.endTime);
      $("summaryDescription").textContent = value.lunchEnabled
        ? "점심 " + value.lunchMinutes + "분을 제외하고 " + formatDuration(regularMinutes + overtimeMinutes) + " 근무해요."
        : "휴게시간 제외 없이 " + formatDuration(regularMinutes + overtimeMinutes) + " 근무해요.";
      $("summaryChip").textContent = value.overtimeEnabled ? "야근 " + formatDuration(overtimeMinutes) : "정시 퇴근";
      $("formError").textContent = validate(value);
      renderVacationSettings(value);
    }

    fields.lunchEnabled.addEventListener("change", function () {
      setDisabledStates();
      updateEndFromWorkHours();
      renderSummary();
    });
    noFixedLunch.addEventListener("change", function () {
      fields.lunchEnabled.checked = !noFixedLunch.checked;
      setDisabledStates();
      updateEndFromWorkHours();
      renderSummary();
    });
    fields.overtimeEnabled.addEventListener("change", function () {
      setDisabledStates();
      renderSummary();
    });
    fields.lunchStart.addEventListener("change", function () {
      updateLunchEndFromMinutes();
      renderSummary();
    });
    fields.lunchEnd.addEventListener("change", function () {
      updateLunchMinutesFromRange();
      renderSummary();
    });
    fields.lunchMinutes.addEventListener("input", function () {
      updateLunchEndFromMinutes();
      renderSummary();
    });

    [
      fields.startTime,
      fields.workHours,
      fields.overtimeEndTime,
      fields.includeOvertimeInProgress,
      fields.freeWorkEnabled,
      fields.hireDate,
      fields.birthday,
      fields.allowVacationAdvance,
      fields.expireUnusedVacation
    ].forEach(function (field) {
      field.addEventListener("change", function () {
        if (field === fields.startTime || field === fields.workHours) updateEndFromWorkHours();
        renderSummary();
      });
    });

    var autoSaveTimer = 0;
    function scheduleAutoSave() {
      window.clearTimeout(autoSaveTimer);
      autoSaveTimer = window.setTimeout(function () {
        var value = readForm();
        if (validate(value)) return;
        if (saveJson(SETTINGS_KEY, value)) settings = value;
      }, 240);
    }
    form.addEventListener("input", scheduleAutoSave);
    form.addEventListener("change", scheduleAutoSave);

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var value = readForm();
      var error = validate(value);
      $("formError").textContent = error;
      if (error) {
        $("formError").scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }

      if (saveJson(SETTINGS_KEY, value)) {
        settings = value;
        showToast("Alarmm 설정을 저장했어요.");
      } else {
        showToast("설정을 저장하지 못했어요. 브라우저 저장공간을 확인해주세요.");
      }
      renderSummary();
    });

    updateEndFromWorkHours();
    setDisabledStates();
    renderSummary();
  }

  function initVacationLegacy() {
    var settings = loadSettings();
    var vacations = loadVacations();
    var attendance = loadAttendance();
    var history = loadHistory();
    var form = $("vacationForm");
    var dateField = $("vacationDate");
    var endDateField = $("vacationEndDate");
    var startPeriodField = $("vacationStartPeriod");
    var endPeriodField = $("vacationEndPeriod");
    var memoField = $("vacationMemo");
    var todayId = localDateId(new Date());

    dateField.min = todayId;
    endDateField.min = todayId;

    function selectedType() {
      var selected = form.querySelector('input[name="vacationType"]:checked');
      return selected ? selected.value : "full";
    }

    function selectedPeriod() {
      var selected = form.querySelector('input[name="vacationPeriod"]:checked');
      return selected ? selected.value : "am";
    }

    function periodInfo(value) {
      if (value === "am") return { type: "half", period: "am", units: 0.5 };
      if (value === "pm") return { type: "half", period: "pm", units: 0.5 };
      if (value === "qam") return { type: "quarter", period: "am", units: 0.25 };
      if (value === "qpm") return { type: "quarter", period: "pm", units: 0.25 };
      return { type: "full", period: "day", units: 1 };
    }

    function rangeDateIds(startId, endId) {
      var start = core.parseDateId(startId);
      var end = core.parseDateId(endId);
      var result = [];
      if (!start || !end || end < start) return result;
      for (var cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
        if (!isWeekend(cursor)) result.push(localDateId(cursor));
        if (result.length > 60) break;
      }
      return result;
    }

    function buildVacationPlan() {
      var dates = rangeDateIds(dateField.value, endDateField.value);
      var specialType = selectedType();
      return dates.map(function (dateId, index) {
        if (specialType !== "full") {
          return { date: dateId, type: specialType, period: "day", units: 0 };
        }
        var segment = "day";
        if (dates.length === 1) segment = startPeriodField.value;
        else if (index === 0) segment = startPeriodField.value;
        else if (index === dates.length - 1) segment = endPeriodField.value;
        var info = periodInfo(segment);
        return { date: dateId, type: info.type, period: info.period, units: info.units };
      });
    }

    function formatVacationRange() {
      if (!dateField.value) return "0000. 00. 00.";
      var start = formatDateInput(dateField.value);
      var end = formatDateInput(endDateField.value || dateField.value);
      return start === end ? start : start + " — " + end;
    }

    function disableForm(disabled) {
      Array.prototype.forEach.call(form.elements, function (element) {
        element.disabled = disabled;
      });
      form.classList.toggle("is-disabled", disabled);
    }

    function renderBalance() {
      var hasHireDate = Boolean(settings.hireDate);
      $("vacationSetupPrompt").hidden = hasHireDate;
      disableForm(!hasHireDate);
      $("advanceBadge").hidden = !settings.allowVacationAdvance;

      if (!hasHireDate) {
        $("balanceLabel").textContent = "남은 휴가일수";
        $("balanceTitle").textContent = "입사일을 입력해주세요";
        $("balanceKind").textContent = "휴가";
        $("balanceValue").textContent = "—";
        $("grantedValue").textContent = "—";
        $("usedValue").textContent = "—";
        $("plannedValue").textContent = "—";
        $("expiryValue").textContent = "—";
        $("nextGrantText").textContent = "—";
        if ($("vacationHistoryNote")) $("vacationHistoryNote").textContent = "입사일 이후의 기록이에요.";
        return;
      }

      var balance = core.calculateBalance(settings.hireDate, vacations, todayId);
      $("balanceLabel").textContent = balance.remaining < 0 ? "당겨쓴 휴가일수" : "남은 휴가일수";
      $("balanceTitle").textContent = balance.label + " 잔여";
      $("balanceKind").textContent = balance.label;
      $("balanceValue").textContent = formatUnits(balance.remaining);
      $("balanceValue").classList.toggle("negative", balance.remaining < 0);
      $("grantedValue").textContent = formatUnits(balance.granted) + "일";
      $("usedValue").textContent = formatUnits(balance.used);
      var plannedUnits = vacations.reduce(function (total, vacation) {
        return vacation.date >= todayId ? total + core.getVacationUnits(vacation) : total;
      }, 0);
      $("plannedValue").textContent = formatUnits(plannedUnits) + "일";
      $("expiryValue").textContent = formatDateKorean(dateIdBefore(balance.periodEnd));
      $("fullVacationLabel").textContent = balance.label + " 1일";
      if ($("vacationHistoryNote")) {
        $("vacationHistoryNote").textContent = "이 기록은 " + formatDateKorean(balance.periodStart) + " 이후 기록이에요.";
      }

      if (balance.nextGrantDate) {
        $("nextGrantText").textContent = formatDateKorean(balance.nextGrantDate);
      } else {
        $("nextGrantText").textContent = "첫 입사기념일까지 사용할 수 있어요.";
      }
    }

    function renderFormState() {
      var plan = buildVacationPlan();
      var units = plan.reduce(function (total, item) { return total + item.units; }, 0);
      var firstPartial = plan.find(function (item) { return item.type === "half" || item.type === "quarter"; });
      $("vacationPeriodFields").hidden = true;
      $("vacationDateDisplay").textContent = formatVacationRange();

      if (dateField.value && settings.hireDate) {
        var entitlement = core.getEntitlement(settings.hireDate, dateField.value);
        if (entitlement.eligible) $("fullVacationLabel").textContent = entitlement.label + " 1일";
      }

      if (firstPartial) {
        $("vacationSchedulePreview").textContent = getVacationScheduleText(firstPartial, settings);
      }

      $("vacationSubmit").textContent = units
        ? "총 " + formatUnits(units) + "일 휴가 신청하기"
        : "비차감 휴가 신청하기";
      $("vacationDateNext").textContent = units
        ? "총 " + formatUnits(units) + "일 · 옵션 선택하기"
        : "휴가 옵션 선택하기";
      $("vacationFormError").textContent = "";
    }

    function validateRequest() {
      if (!settings.hireDate) return "설정에서 입사일을 먼저 입력해주세요.";
      if (!dateField.value || !endDateField.value) return "휴가 시작일과 종료일을 선택해주세요.";
      if (dateField.value < todayId) return "지난 날짜에는 휴가를 신청할 수 없어요.";
      if (endDateField.value < dateField.value) return "종료일은 시작일보다 빠를 수 없어요.";
      var plan = buildVacationPlan();
      if (!plan.length) return "선택한 기간에 신청할 근무일이 없어요.";
      if (plan.length > 60) return "한 번에 신청할 수 있는 기간은 근무일 60일까지예요.";

      for (var index = 0; index < plan.length; index += 1) {
        var item = plan[index];
        if (findVacation(vacations, item.date)) return formatDateShort(item.date) + "에는 이미 신청한 휴가가 있어요.";
        var existingAttendance = attendance[item.date];
        var completedHistory = history.some(function (record) { return record.date === item.date; });
        if (completedHistory) return formatDateShort(item.date) + "에는 이미 근무 완료 기록이 있어요.";
        if (existingAttendance && existingAttendance.clockInAt && (isFullDayVacation(item) || item.period === "am")) {
          return "이미 출근한 날에는 전일 또는 오전 휴가를 신청할 수 없어요.";
        }
      }

      var units = plan.reduce(function (total, item) { return total + item.units; }, 0);
      if (units > 0) {
        var balance = core.calculateBalance(settings.hireDate, vacations, dateField.value);
        if (!balance.eligible) return "입사일 이후의 날짜를 선택해주세요.";
        if (!settings.allowVacationAdvance && balance.remaining - units < 0) {
          return "남은 " + balance.label + "가 부족해요. 설정에서 당겨쓰기를 켜면 신청할 수 있어요.";
        }
      }
      return "";
    }

    function renderVacationList() {
      var list = $("vacationList");
      var sorted = vacations.slice().sort(function (a, b) {
        return String(b.date || "").localeCompare(String(a.date || "")) ||
          String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
      });
      var plannedCount = vacations.filter(function (vacation) { return vacation.date >= todayId; }).length;
      $("vacationCount").textContent = plannedCount + "개 사용 예정";
      list.innerHTML = "";

      if (!sorted.length) {
        var empty = document.createElement("div");
        empty.className = "history-empty vacation-empty";
        empty.innerHTML = "<strong>아직 신청한 휴가가 없어요.</strong><span>신청하면 출퇴근 일정에도 바로 반영돼요.</span>";
        list.appendChild(empty);
        return;
      }

      sorted.slice(0, 3).forEach(function (vacation) {
        var article = document.createElement("article");
        article.className = "vacation-item";
        var header = document.createElement("div");
        header.className = "vacation-item-heading";
        var titleWrap = document.createElement("div");
        var date = document.createElement("time");
        date.dateTime = vacation.date;
        date.textContent = formatDateKorean(vacation.date);
        var title = document.createElement("h3");
        title.textContent = getVacationLabel(vacation, settings);
        titleWrap.append(date, title);
        var status = document.createElement("span");
        status.className = "vacation-status";
        status.textContent = vacation.date < todayId ? "사용 완료" : vacation.date === todayId ? "오늘" : "신청 완료";
        if (vacation.date < todayId) status.classList.add("complete");
        header.append(titleWrap, status);

        var detail = document.createElement("p");
        detail.className = "vacation-item-detail";
        detail.textContent = getVacationScheduleText(vacation, settings) +
          (core.isChargeableVacation(vacation)
            ? " · " + formatUnits(core.getVacationUnits(vacation)) + "일 차감"
            : " · 연차 비차감");
        article.append(header, detail);

        if (vacation.memo) {
          var memo = document.createElement("p");
          memo.className = "vacation-item-memo";
          memo.textContent = vacation.memo;
          article.appendChild(memo);
        }

        var cancel = document.createElement("button");
        cancel.className = "vacation-cancel";
        cancel.type = "button";
        cancel.dataset.vacationId = vacation.id;
        cancel.textContent = "신청 취소";
        article.appendChild(cancel);
        list.appendChild(article);
      });
    }

    function renderAll() {
      renderBalance();
      renderFormState();
      renderVacationList();
    }

    function showVacationSheet(stage) {
      $("vacationFlowDialog").hidden = false;
      $("vacationDateSheet").hidden = stage !== "date";
      $("vacationOptionSheet").hidden = stage !== "options";
      document.body.style.overflow = "hidden";
    }

    function closeVacationSheet() {
      $("vacationFlowDialog").hidden = true;
      document.body.style.overflow = "";
    }

    function validateDateRangeOnly() {
      if (!dateField.value || !endDateField.value) return "휴가 시작일과 종료일을 선택해주세요.";
      if (dateField.value < todayId) return "지난 날짜에는 휴가를 신청할 수 없어요.";
      if (endDateField.value < dateField.value) return "종료일은 시작일보다 빠를 수 없어요.";
      var plan = buildVacationPlan();
      if (!plan.length) return "선택한 기간에 신청할 근무일이 없어요.";
      for (var index = 0; index < plan.length; index += 1) {
        if (findVacation(vacations, plan[index].date)) return formatDateShort(plan[index].date) + "에는 이미 신청한 휴가가 있어요.";
      }
      return "";
    }

    form.addEventListener("change", renderFormState);
    dateField.addEventListener("input", function () {
      endDateField.min = dateField.value || todayId;
      if (!endDateField.value || endDateField.value < dateField.value) endDateField.value = dateField.value;
      renderFormState();
    });
    endDateField.addEventListener("input", renderFormState);

    $("vacationOpenButton").addEventListener("click", function () {
      if (!settings.hireDate) {
        $("vacationFormError").textContent = "설정에서 입사일을 먼저 입력해주세요.";
        return;
      }
      showVacationSheet("date");
    });
    $("vacationNextButton").addEventListener("click", function () {
      if (!settings.hireDate) {
        $("vacationFormError").textContent = "설정에서 입사일을 먼저 입력해주세요.";
        return;
      }
      showVacationSheet("date");
    });
    $("vacationSheetClose").addEventListener("click", closeVacationSheet);
    $("vacationOptionBack").addEventListener("click", function () { showVacationSheet("date"); });
    $("vacationDateNext").addEventListener("click", function () {
      var error = validateDateRangeOnly();
      $("vacationFormError").textContent = error;
      if (!error) showVacationSheet("options");
    });
    $("vacationFlowDialog").addEventListener("click", function (event) {
      if (event.target === this) closeVacationSheet();
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var error = validateRequest();
      $("vacationFormError").textContent = error;
      if (error) return;

      var createdAt = new Date().toISOString();
      var requestId = "request-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
      var plan = buildVacationPlan();
      var unauthorized = $("vacationUnauthorized").checked;
      var additions = plan.map(function (item, index) {
        return {
          id: requestId + "-" + index,
          requestId: requestId,
          date: item.date,
          type: item.type,
          period: item.period,
          units: item.units,
          unauthorized: unauthorized,
          memo: memoField.value.trim(),
          createdAt: createdAt
        };
      });

      Array.prototype.push.apply(vacations, additions);
      if (!saveJson(VACATION_KEY, vacations)) {
        vacations.splice(vacations.length - additions.length, additions.length);
        $("vacationFormError").textContent = "휴가를 저장하지 못했어요. 브라우저 저장공간을 확인해주세요.";
        return;
      }

      memoField.value = "";
      form.querySelector('input[name="vacationType"][value="full"]').checked = true;
      form.querySelector('input[name="vacationPeriod"][value="am"]').checked = true;
      $("vacationUnauthorized").checked = false;
      closeVacationSheet();
      renderAll();
      var updatedBalance = core.calculateBalance(settings.hireDate, vacations, todayId);
      showToast(
        updatedBalance.remaining < 0
          ? "휴가를 신청했어요. 잔여 " + formatUnits(updatedBalance.remaining) + "일이에요."
          : "휴가를 신청하고 출퇴근 일정에 반영했어요."
      );
    });

    $("vacationList").addEventListener("click", function (event) {
      var button = event.target.closest("[data-vacation-id]");
      if (!button) return;
      var targetVacation = vacations.find(function (vacation) {
        return vacation.id === button.dataset.vacationId;
      });
      if (!targetVacation) return;
      if (!window.confirm(formatDateLong(targetVacation.date) + " 휴가 신청을 취소할까요?")) return;

      vacations = vacations.filter(function (vacation) {
        return vacation.id !== targetVacation.id;
      });
      saveJson(VACATION_KEY, vacations);
      renderAll();
      showToast("휴가 신청을 취소했어요.");
    });

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) {
        settings = loadSettings();
        vacations = loadVacations();
        attendance = loadAttendance();
        history = loadHistory();
        renderAll();
      }
    });

    renderAll();
  }

  function initVacation() {
    var settings = loadSettings();
    var vacations = loadVacations();
    var attendance = loadAttendance();
    var history = loadHistory();
    var form = $("vacationForm");
    var dateField = $("vacationDate");
    var endDateField = $("vacationEndDate");
    var startPeriodField = $("vacationStartPeriod");
    var endPeriodField = $("vacationEndPeriod");
    var startTimeField = $("vacationStartTime");
    var endTimeField = $("vacationEndTime");
    var nonChargeField = $("vacationNonCharge");
    var reasonGroup = form.querySelector(".reason-segments");
    var flowDialog = $("vacationFlowDialog");
    var todayId = localDateId(new Date());
    var pendingAdditions = null;
    var lastSaveError = "";

    dateField.min = todayId;
    endDateField.min = todayId;
    startTimeField.value = settings.startTime;
    endTimeField.value = settings.endTime;

    function halfDayBoundary() {
      if (settings.lunchEnabled) return settings.lunchStart;
      return formatTimeFromMinutes(parseTime(settings.startTime) + Number(settings.workHours || 8) * 30);
    }

    function afternoonBoundary() {
      return settings.lunchEnabled ? settings.lunchEnd : halfDayBoundary();
    }

    function selectedSpecialType() {
      if (!nonChargeField.checked) return "full";
      var selected = reasonGroup.querySelector("[data-special-choice].selected");
      return selected ? selected.dataset.specialChoice : "health";
    }

    function rangeDateIds(startId, endId) {
      var start = core.parseDateId(startId);
      var end = core.parseDateId(endId);
      var result = [];
      if (!start || !end || end < start) return result;
      for (var cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
        if (!isWeekend(cursor)) result.push(localDateId(cursor));
        if (result.length > 60) break;
      }
      return result;
    }

    function firstBoundary() {
      if (startPeriodField.value === "pm") return afternoonBoundary();
      if (startPeriodField.value === "time") return startTimeField.value;
      return settings.startTime;
    }

    function lastBoundary() {
      if (endPeriodField.value === "am") return halfDayBoundary();
      if (endPeriodField.value === "time") return endTimeField.value;
      return settings.endTime;
    }

    function classifyVacation(startTime, endTime, units) {
      if (units >= 0.99) return { type: "full", period: "day" };
      if (Math.abs(units - 0.5) < 0.01) {
        if (startTime === settings.startTime) return { type: "half", period: "am" };
        if (endTime === settings.endTime) return { type: "half", period: "pm" };
      }
      if (Math.abs(units - 0.25) < 0.01) {
        if (startTime === settings.startTime) return { type: "quarter", period: "am" };
        if (endTime === settings.endTime) return { type: "quarter", period: "pm" };
      }
      return {
        type: "hour",
        period: parseTime(startTime) < parseTime(afternoonBoundary()) ? "am" : "pm"
      };
    }

    function buildVacationPlan() {
      var dates = rangeDateIds(dateField.value, endDateField.value);
      var specialType = selectedSpecialType();
      return dates.map(function (dateId, index) {
        if (specialType !== "full") {
          return { date: dateId, type: specialType, period: "day", units: 0 };
        }

        var startTime = index === 0 ? firstBoundary() : settings.startTime;
        var endTime = index === dates.length - 1 ? lastBoundary() : settings.endTime;
        var units = core.calculateVacationRangeDayUnits({
          index: index,
          total: dates.length,
          startPeriod: startPeriodField.value,
          endPeriod: endPeriodField.value,
          startTime: startTime,
          endTime: endTime,
          settings: settings
        });
        var classification = classifyVacation(startTime, endTime, units);
        return {
          date: dateId,
          type: classification.type,
          period: classification.period,
          units: units,
          startTime: startTime,
          endTime: endTime
        };
      });
    }

    function formatReviewDate(dateId, time) {
      var date = core.parseDateId(dateId);
      if (!date) return "—";
      var weekdays = ["일", "월", "화", "수", "목", "금", "토"];
      return date.getFullYear() + ". " + pad(date.getMonth() + 1) + ". " + pad(date.getDate()) +
        ". (" + weekdays[date.getDay()] + ") " + time;
    }

    function syncDateDisplay(input) {
      var display = form.querySelector('[data-display-for="' + input.id + '"]');
      if (!display) return;
      display.textContent = formatDateInput(input.value);
      display.parentElement.classList.toggle("has-value", Boolean(input.value));
    }

    function setReasonVisibility(show, animateChange) {
      if (reasonGroup.hidden === !show) return;
      if (animateChange && window.AlarmmMotion && window.AlarmmMotion.toggleVacationTypes) {
        window.AlarmmMotion.toggleVacationTypes(reasonGroup, show);
      } else {
        reasonGroup.hidden = !show;
      }
      form.classList.toggle("has-vacation-types", show);
    }

    function disableForm(disabled) {
      Array.prototype.forEach.call(form.elements, function (element) {
        element.disabled = disabled;
      });
      form.classList.toggle("is-disabled", disabled);
    }

    function renderBalance() {
      var hasHireDate = Boolean(settings.hireDate);
      $("vacationSetupPrompt").hidden = hasHireDate;
      disableForm(!hasHireDate);
      $("advanceBadge").hidden = !settings.allowVacationAdvance;

      if (!hasHireDate) {
        $("balanceLabel").textContent = "남은 휴가일수";
        $("balanceTitle").textContent = "입사일을 입력해주세요";
        $("balanceKind").textContent = "휴가";
        ["balanceValue", "grantedValue", "usedValue", "plannedValue", "expiryValue", "nextGrantText"].forEach(function (id) {
          $(id).textContent = "—";
        });
        $("vacationHistoryNote").textContent = "입사일 이후의 기록이에요.";
        return;
      }

      var balance = core.calculateBalance(settings.hireDate, vacations, todayId);
      $("balanceLabel").textContent = balance.remaining < 0 ? "당겨쓴 휴가일수" : "남은 휴가일수";
      $("balanceTitle").textContent = balance.label + " 잔여";
      $("balanceKind").textContent = balance.label;
      $("balanceValue").textContent = formatUnits(balance.remaining);
      $("balanceValue").classList.toggle("negative", balance.remaining < 0);
      $("grantedValue").textContent = formatUnits(balance.granted) + "일";
      $("usedValue").textContent = formatUnits(balance.used);
      var plannedUnits = vacations.reduce(function (total, vacation) {
        return vacation.date >= todayId ? total + core.getVacationUnits(vacation) : total;
      }, 0);
      $("plannedValue").textContent = formatUnits(plannedUnits) + "일";
      $("expiryValue").textContent = formatDateKorean(dateIdBefore(balance.periodEnd));
      $("fullVacationLabel").textContent = balance.label + " 1일";
      $("vacationHistoryNote").textContent = "이 기록은 " + formatDateKorean(balance.periodStart) + " 이후 기록이에요.";
      $("nextGrantText").textContent = balance.nextGrantDate
        ? formatDateKorean(balance.nextGrantDate)
        : "첫 입사기념일까지 사용할 수 있어요.";
    }

    function renderFormState() {
      syncDateDisplay(dateField);
      syncDateDisplay(endDateField);
      setReasonVisibility(nonChargeField.checked, false);
      if (dateField.value && settings.hireDate) {
        var entitlement = core.getEntitlement(settings.hireDate, dateField.value);
        if (entitlement.eligible) $("fullVacationLabel").textContent = entitlement.label + " 1일";
      }
    }

    function validateRequest() {
      if (!settings.hireDate) return "설정에서 입사일을 먼저 입력해주세요.";
      if (!dateField.value || !endDateField.value) return "휴가 시작일과 종료일을 선택해주세요.";
      if (!startTimeField.value || !endTimeField.value) return "휴가 시작과 종료 시각을 입력해주세요.";
      if (dateField.value < todayId) return "지난 날짜에는 휴가를 신청할 수 없어요.";
      if (endDateField.value < dateField.value) return "종료일은 시작일보다 빠를 수 없어요.";

      var workEndOffset = offsetAfterStart(settings.endTime, settings.startTime);
      if (workEndOffset === 0) workEndOffset = 1440;
      var startBoundaryOffset = offsetAfterStart(firstBoundary(), settings.startTime);
      var endBoundaryOffset = offsetAfterStart(lastBoundary(), settings.startTime);
      if (startBoundaryOffset > workEndOffset || endBoundaryOffset > workEndOffset) {
        return "휴가 시각은 설정한 근무시간 안에서 선택해주세요.";
      }
      if (dateField.value === endDateField.value && endBoundaryOffset <= startBoundaryOffset) {
        return "종료 시각은 시작 시각보다 늦어야 해요.";
      }

      var plan = buildVacationPlan();
      if (!plan.length) return "선택한 기간에 신청할 근무일이 없어요.";
      if (plan.length > 60) return "한 번에 신청할 수 있는 기간은 근무일 60일까지예요.";
      if (selectedSpecialType() === "full" && plan.some(function (item) { return item.units <= 0; })) {
        return "종료 시각은 시작 시각보다 늦어야 하고 근무시간 안에 있어야 해요.";
      }

      for (var index = 0; index < plan.length; index += 1) {
        var item = plan[index];
        if (findVacation(vacations, item.date)) return formatDateShort(item.date) + "에는 이미 신청한 휴가가 있어요.";
        var existingAttendance = attendance[item.date];
        var completedHistory = history.some(function (record) { return record.date === item.date; });
        if (completedHistory) return formatDateShort(item.date) + "에는 이미 근무 완료 기록이 있어요.";
        if (existingAttendance && existingAttendance.clockInAt && (isFullDayVacation(item) || item.period === "am")) {
          return "이미 출근한 날에는 전일 또는 오전 휴가를 신청할 수 없어요.";
        }
      }

      var units = plan.reduce(function (total, item) { return total + item.units; }, 0);
      if (units > 0) {
        var balance = core.calculateBalance(settings.hireDate, vacations, dateField.value);
        if (!balance.eligible) return "입사일 이후의 날짜를 선택해주세요.";
        if (!settings.allowVacationAdvance && balance.remaining - units < 0) {
          return "남은 " + balance.label + "가 부족해요. 설정에서 당겨쓰기를 켜면 신청할 수 있어요.";
        }
      }
      return "";
    }

    function renderReview() {
      var plan = buildVacationPlan();
      var first = plan[0];
      var last = plan[plan.length - 1];
      var units = plan.reduce(function (total, item) { return total + item.units; }, 0);
      $("vacationReviewStart").textContent = formatReviewDate(first.date, first.startTime || settings.startTime);
      $("vacationReviewEnd").textContent = formatReviewDate(last.date, last.endTime || settings.endTime);
      $("vacationReviewUnits").textContent = units > 0
        ? formatUnits(units) + "일"
        : getVacationLabel(first, settings);
    }

    function renderVacationList() {
      var list = $("vacationList");
      var sorted = vacations.slice().sort(function (a, b) {
        return String(b.date || "").localeCompare(String(a.date || "")) ||
          String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
      });
      var plannedCount = vacations.filter(function (vacation) { return vacation.date >= todayId; }).length;
      $("vacationCount").textContent = plannedCount + "개 사용 예정";
      list.innerHTML = "";

      if (!sorted.length) {
        var empty = document.createElement("div");
        empty.className = "history-empty vacation-empty";
        empty.innerHTML = "<strong>아직 신청한 휴가가 없어요.</strong><span>신청하면 출퇴근 일정에도 바로 반영돼요.</span>";
        list.appendChild(empty);
        return;
      }

      sorted.slice(0, 3).forEach(function (vacation) {
        var article = document.createElement("article");
        article.className = "vacation-item";
        var header = document.createElement("div");
        header.className = "vacation-item-heading";
        var titleWrap = document.createElement("div");
        var date = document.createElement("time");
        date.dateTime = vacation.date;
        date.textContent = formatDateKorean(vacation.date);
        var title = document.createElement("h3");
        title.textContent = getVacationLabel(vacation, settings);
        titleWrap.append(date, title);
        var status = document.createElement("span");
        status.className = "vacation-status";
        status.textContent = vacation.date < todayId ? "사용 완료" : vacation.date === todayId ? "오늘" : "신청 완료";
        if (vacation.date < todayId) status.classList.add("complete");
        header.append(titleWrap, status);
        article.appendChild(header);

        var cancel = document.createElement("button");
        cancel.className = "vacation-cancel";
        cancel.type = "button";
        cancel.dataset.vacationId = vacation.id;
        cancel.textContent = "신청 취소";
        article.appendChild(cancel);
        list.appendChild(article);
      });
    }

    function renderAll() {
      renderBalance();
      renderFormState();
      renderVacationList();
    }

    function stageElement(stage) {
      return {
        step2: $("vacationStep2"),
        step3: $("vacationStep3"),
        finish: $("vacationFinish"),
        error: $("vacationError")
      }[stage];
    }

    function showVacationStage(stage) {
      var next = stageElement(stage);
      if (!next) return;
      document.body.style.overflow = "hidden";
      if (window.AlarmmMotion && window.AlarmmMotion.setVacationStage) {
        window.AlarmmMotion.setVacationStage(flowDialog, next);
      } else {
        flowDialog.hidden = false;
        flowDialog.querySelectorAll(".bottom-sheet").forEach(function (panel) { panel.hidden = panel !== next; });
      }
      window.setTimeout(function () {
        var focusTarget = next.querySelector("input:not([type='hidden']), button");
        if (focusTarget) focusTarget.focus({ preventScroll: true });
      }, 40);
    }

    function closeVacationFlow() {
      var finish = function () {
        flowDialog.hidden = true;
        flowDialog.querySelectorAll(".bottom-sheet").forEach(function (panel) { panel.hidden = true; });
        document.body.style.overflow = "";
        $("vacationNextButton").focus();
      };
      if (window.AlarmmMotion && window.AlarmmMotion.closeVacationFlow) {
        window.AlarmmMotion.closeVacationFlow(flowDialog, finish);
      } else {
        finish();
      }
    }

    function setBoundaryDefaults(field) {
      if (field === startPeriodField) {
        if (field.value === "pm") startTimeField.value = afternoonBoundary();
        else if (field.value !== "time" || !startTimeField.value) startTimeField.value = settings.startTime;
        startTimeField.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        if (field.value === "am") endTimeField.value = halfDayBoundary();
        else if (field.value !== "time" || !endTimeField.value) endTimeField.value = settings.endTime;
        endTimeField.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }

    function createPendingAdditions() {
      var requestId = "request-" + (window.crypto && window.crypto.randomUUID
        ? window.crypto.randomUUID()
        : Date.now() + "-" + Math.random().toString(36).slice(2, 7));
      var createdAt = new Date().toISOString();
      return buildVacationPlan().map(function (item, index) {
        return Object.assign({}, item, {
          id: requestId + "-" + index,
          requestId: requestId,
          createdAt: createdAt
        });
      });
    }

    function resetVacationForm() {
      dateField.value = "";
      endDateField.value = "";
      startPeriodField.value = "day";
      endPeriodField.value = "day";
      startTimeField.value = settings.startTime;
      endTimeField.value = settings.endTime;
      nonChargeField.checked = false;
      form.querySelectorAll(".start-period-segments button, .end-period-segments button").forEach(function (button) {
        button.classList.toggle("selected", button.dataset.periodChoice === "day" || button.dataset.endPeriodChoice === "day");
      });
      reasonGroup.querySelectorAll("button").forEach(function (button, index) { button.classList.toggle("selected", index === 0); });
      renderFormState();
      [startTimeField, endTimeField].forEach(function (field) {
        field.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }

    function savePendingVacation() {
      if (!pendingAdditions) pendingAdditions = createPendingAdditions();
      Array.prototype.push.apply(vacations, pendingAdditions);
      if (!saveJson(VACATION_KEY, vacations)) {
        vacations.splice(vacations.length - pendingAdditions.length, pendingAdditions.length);
        lastSaveError = "브라우저 저장공간에 기록하지 못했어요. 저장공간과 개인정보 보호 설정을 확인해주세요.";
        $("vacationErrorDescription").textContent = "휴가 신청에 실패했어요.";
        showVacationStage("error");
        return;
      }

      pendingAdditions = null;
      renderAll();
      resetVacationForm();
      showVacationStage("finish");
    }

    form.addEventListener("change", renderFormState);
    dateField.addEventListener("input", function () {
      endDateField.min = dateField.value || todayId;
      if (endDateField.value && endDateField.value < dateField.value) endDateField.value = dateField.value;
      renderFormState();
    });
    endDateField.addEventListener("input", renderFormState);
    startPeriodField.addEventListener("change", function () { setBoundaryDefaults(startPeriodField); });
    endPeriodField.addEventListener("change", function () { setBoundaryDefaults(endPeriodField); });
    nonChargeField.addEventListener("change", function () {
      setReasonVisibility(nonChargeField.checked, true);
    });

    $("vacationNextButton").addEventListener("click", function () {
      var error = !settings.hireDate
        ? "설정에서 입사일을 먼저 입력해주세요."
        : !dateField.value
          ? "휴가 시작일을 선택해주세요."
          : dateField.value < todayId
            ? "지난 날짜에는 휴가를 신청할 수 없어요."
            : "";
      $("vacationFormError").textContent = error;
      if (error) return;
      endDateField.min = dateField.value;
      if (!endDateField.value || endDateField.value < dateField.value) endDateField.value = dateField.value;
      syncDateDisplay(endDateField);
      showVacationStage("step2");
    });

    $("vacationReviewButton").addEventListener("click", function () {
      var error = validateRequest();
      $("vacationStep2Error").textContent = error;
      $("vacationFormError").textContent = error;
      if (error) return;
      renderReview();
      pendingAdditions = null;
      showVacationStage("step3");
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var error = validateRequest();
      if (error) {
        $("vacationStep2Error").textContent = error;
        showVacationStage("step2");
        return;
      }
      savePendingVacation();
    });

    $("vacationRetryButton").addEventListener("click", savePendingVacation);
    $("vacationExplainButton").addEventListener("click", function () {
      $("vacationErrorDescription").textContent = lastSaveError || "입력한 날짜와 잔여 휴가를 다시 확인해주세요.";
    });
    $("vacationFinishButton").addEventListener("click", closeVacationFlow);
    flowDialog.addEventListener("click", function (event) {
      if (event.target === flowDialog) closeVacationFlow();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !flowDialog.hidden) closeVacationFlow();
    });

    $("vacationList").addEventListener("click", function (event) {
      var button = event.target.closest("[data-vacation-id]");
      if (!button) return;
      var targetVacation = vacations.find(function (vacation) { return vacation.id === button.dataset.vacationId; });
      if (!targetVacation || !window.confirm(formatDateLong(targetVacation.date) + " 휴가 신청을 취소할까요?")) return;
      vacations = vacations.filter(function (vacation) { return vacation.id !== targetVacation.id; });
      saveJson(VACATION_KEY, vacations);
      renderAll();
      showToast("휴가 신청을 취소했어요.");
    });

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) {
        settings = loadSettings();
        vacations = loadVacations();
        attendance = loadAttendance();
        history = loadHistory();
        startTimeField.value = startTimeField.value || settings.startTime;
        endTimeField.value = endTimeField.value || settings.endTime;
        renderAll();
      }
    });

    renderAll();
  }

  function initCalendar() {
    var history = loadHistory();
    var attendance = loadAttendance();
    var vacations = loadVacations();
    var settings = loadSettings();
    var today = new Date();
    var visibleMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    function sumMinutes(year, month) {
      return history.reduce(function (total, record) {
        var date = core.parseDateId(record.date);
        if (!date || date.getFullYear() !== year) return total;
        if (typeof month === "number" && date.getMonth() !== month) return total;
        return total + Number(record.minutes || 0);
      }, 0);
    }

    function workedOn(dateId) {
      return Boolean(attendance[dateId] && attendance[dateId].clockInAt) || history.some(function (record) {
        return record.date === dateId;
      });
    }

    function renderMonthGrid() {
      var year = visibleMonth.getFullYear();
      var month = visibleMonth.getMonth();
      var firstDay = new Date(year, month, 1).getDay();
      var days = new Date(year, month + 1, 0).getDate();
      var grid = $("monthlyCalendar");
      grid.innerHTML = "";
      $("calendarMonthLabel").textContent = year + "년 " + (month + 1) + "월";
      $("monthDaysLabel").textContent = days + "일";

      for (var blank = 0; blank < firstDay; blank += 1) {
        var empty = document.createElement("span");
        empty.className = "month-day empty";
        empty.setAttribute("aria-hidden", "true");
        grid.appendChild(empty);
      }

      var attendanceCount = 0;
      for (var day = 1; day <= days; day += 1) {
        var date = new Date(year, month, day);
        var dateId = localDateId(date);
        var vacation = findVacation(vacations, dateId);
        var worked = workedOn(dateId);
        if (worked) attendanceCount += 1;
        var cell = document.createElement("span");
        cell.className = "month-day";
        if (isWeekend(date)) cell.classList.add("weekend");
        if (worked) cell.classList.add("worked");
        else if (vacation) cell.classList.add("vacation");
        if (dateId === localDateId(today)) cell.classList.add("today");
        cell.setAttribute(
          "aria-label",
          (month + 1) + "월 " + day + "일, " +
          (worked ? "출근 기록 있음" : vacation ? getVacationLabel(vacation, settings) : "기록 없음")
        );
        var number = document.createElement("span");
        number.textContent = day;
        cell.appendChild(number);
        grid.appendChild(cell);
      }

      $("monthAttendanceCount").textContent = attendanceCount + "일";
      $("monthAttendanceBar").style.width = Math.min(100, (attendanceCount / Math.max(1, days)) * 100) + "%";
    }

    function renderTotalsAndHistory() {
      var year = visibleMonth.getFullYear();
      var month = visibleMonth.getMonth();
      var previous = new Date(year, month - 1, 1);
      var monthMinutes = sumMinutes(year, month);
      var lastMonthMinutes = sumMinutes(previous.getFullYear(), previous.getMonth());
      var yearMinutes = sumMinutes(year);

      $("calendarMonthTotal").textContent = formatDuration(monthMinutes);
      $("calendarLastMonthTotal").textContent = formatDuration(lastMonthMinutes);
      $("calendarYearTotal").textContent = formatDuration(yearMinutes);
      $("calendarMonthBar").style.width = Math.min(100, (monthMinutes / (160 * 60)) * 100) + "%";
      $("calendarLastMonthBar").style.width = Math.min(100, (lastMonthMinutes / (160 * 60)) * 100) + "%";
      $("calendarYearBar").style.width = Math.min(100, (yearMinutes / (1920 * 60)) * 100) + "%";

      var records = history.filter(function (record) {
        var date = core.parseDateId(record.date);
        return date && date.getFullYear() === year && date.getMonth() === month;
      }).sort(function (a, b) { return b.date.localeCompare(a.date); });
      var list = $("calendarHistoryList");
      list.innerHTML = "";
      if (!records.length) {
        var empty = document.createElement("div");
        empty.className = "history-empty";
        empty.innerHTML = "<strong>이 달의 근무기록이 없어요.</strong><span>퇴근을 완료하면 기록이 여기에 쌓여요.</span>";
        list.appendChild(empty);
        return;
      }
      records.forEach(function (record) {
        var item = document.createElement("article");
        item.className = "history-item";
        item.innerHTML = "<div><time>" + formatDateLong(record.date) + "</time><h3>근무 완료</h3></div><strong>" + formatDuration(record.minutes) + "</strong>";
        list.appendChild(item);
      });
    }

    function render() {
      renderMonthGrid();
      renderTotalsAndHistory();
    }

    $("calendarPrev").addEventListener("click", function () {
      visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
      render();
    });
    $("calendarNext").addEventListener("click", function () {
      visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
      render();
    });
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) {
        history = loadHistory();
        attendance = loadAttendance();
        vacations = loadVacations();
        settings = loadSettings();
        render();
      }
    });
    render();
  }

  var page = document.body.dataset.page;
  if (page === "home") initHome();
  if (page === "settings") initSettings();
  if (page === "vacation") initVacation();
  if (page === "calendar") initCalendar();
})();
