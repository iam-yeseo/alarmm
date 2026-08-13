(function () {
  "use strict";

  var SETTINGS_KEY = "alarmm-settings-v1";
  var HISTORY_KEY = "alarmm-history-v1";
  var ATTENDANCE_KEY = "alarmm-attendance-v1";
  var MINUTE_MS = 60 * 1000;

  var defaultSettings = {
    startTime: "09:00",
    endTime: "18:00",
    lunchEnabled: true,
    lunchStart: "12:00",
    lunchEnd: "13:00",
    lunchMinutes: 60,
    overtimeEnabled: false,
    overtimeEndTime: "20:00",
    includeOvertimeInProgress: true
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

  function getSchedule(baseDate, settings) {
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

    return {
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
      lunchEnabled: settings.lunchEnabled
    };
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

  function localDateId(date) {
    return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join("-");
  }

  function isWeekend(date) {
    return date.getDay() === 0 || date.getDay() === 6;
  }

  function nextWeekdayStart(now, startTime) {
    var candidate = new Date(now);
    candidate.setDate(candidate.getDate() + 1);
    while (isWeekend(candidate)) candidate.setDate(candidate.getDate() + 1);
    var minutes = parseTime(startTime);
    candidate.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    return candidate;
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
    var showRemainingAsMain = false;
    var lastCalendarDay = "";
    var dialogConfirmAction = null;

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
      if (lastCalendarDay === todayId) return;
      lastCalendarDay = todayId;

      var weekdays = ["일", "월", "화", "수", "목", "금", "토"];
      var calendar = $("weekCalendar");
      calendar.innerHTML = "";

      for (var index = -3; index <= 3; index += 1) {
        var date = new Date(now);
        date.setDate(now.getDate() + index);
        var item = document.createElement("li");
        item.className = "week-day";
        if (index === 0) item.classList.add("today");
        if (isWeekend(date)) item.classList.add("weekend");

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
      if (state === "weekend") return nextWeekdayStart(now, settings.startTime);
      if (state === "before") return schedule.start;
      if (state === "lunch") return schedule.lunchEnd;
      return schedule.countdownEnd;
    }

    function getRemainingLabel(state) {
      return {
        weekend: "다음 출근까지",
        before: "출근까지 남은 시간",
        lunch: "점심 종료까지",
        working: "퇴근까지 남은 시간",
        overtime: "야근 종료까지",
        complete: "오늘 근무 완료"
      }[state];
    }

    function renderClock() {
      var now = new Date();
      var schedule = getSchedule(now, settings);
      var state = getDayState(now, schedule);
      var progress = state === "weekend" ? 0 : getProgress(now, schedule);
      var timelineProgress = state === "weekend" ? 0 : getTimelineProgress(now, schedule);
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

      var percent = Math.round(progress * 100);
      $("arcDial").style.setProperty("--gauge-progress", progress * 180 + "deg");
      $("progressPercent").textContent = percent + "%";
      $("timelineFill").style.width = timelineProgress * 100 + "%";

      var totalOffset = Math.max(1, schedule.countdownEndOffset);
      $("lunchStartMarker").style.left =
        Math.min(100, Math.max(0, (schedule.lunchStartOffset / totalOffset) * 100)) + "%";
      $("lunchEndMarker").style.left =
        Math.min(100, Math.max(0, (schedule.lunchEndOffset / totalOffset) * 100)) + "%";

      $("timelineStart").textContent = settings.startTime;
      $("timelineEnd").textContent = settings.overtimeEnabled
        ? settings.overtimeEndTime
        : settings.endTime;
      $("timelineEndLabel").textContent = settings.overtimeEnabled ? "야근 종료" : "퇴근";
      $("timelineLunch").textContent = settings.lunchStart + "–" + settings.lunchEnd;
      $("timelineLunchWrap").hidden = !settings.lunchEnabled;
      $("lunchStartMarker").hidden = !settings.lunchEnabled;
      $("lunchEndMarker").hidden = !settings.lunchEnabled;

      renderWorkState(state, schedule);
    }

    function setWorkButton(button, label, action, className) {
      $("workStateLabel").textContent = label;
      button.dataset.action = action || "";
      button.classList.remove("complete", "overtime", "check-in");
      if (className) button.classList.add(className);
      button.disabled = !action;
      button.setAttribute("aria-label", action === "checkout" ? "퇴근하기" : label);
    }

    function getTodayAttendance() {
      return attendance[localDateId(new Date())] || null;
    }

    function renderWorkState(state, schedule) {
      var button = $("workStateButton");
      var saveButton = $("saveTodayButton");
      var recorded = history.some(function (item) {
        return item.date === localDateId(new Date());
      });
      var todayAttendance = getTodayAttendance();

      saveButton.hidden = true;

      if (state === "weekend") {
        setWorkButton(button, "오늘은 쉬어가는 날", "", "");
      } else if (todayAttendance && todayAttendance.clockOutAt) {
        setWorkButton(button, "퇴근 완료", "", "complete");
      } else if (recorded) {
        setWorkButton(button, "오늘 근무기록 저장 완료", "", "complete");
      } else if (!todayAttendance || !todayAttendance.clockInAt) {
        setWorkButton(button, "출근하기", "clock-in", "check-in");
      } else if (state === "overtime") {
        setWorkButton(button, "야근 중 · " + settings.overtimeEndTime + " 종료", "checkout", "overtime");
      } else {
        setWorkButton(button, "근무 중", "checkout", "");
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
    }

    function clockIn() {
      var now = new Date();
      var schedule = getSchedule(now, settings);
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
            late: isLate
          };
          saveAttendance();
          renderClock();
          showToast(isLate ? "지각 출근으로 기록했어요." : "출근을 기록했어요.");
        }
      );
    }

    function clockOut() {
      var now = new Date();
      var schedule = getSchedule(now, settings);
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

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) {
        settings = loadSettings();
        history = loadHistory();
        attendance = loadAttendance();
        renderHistory();
        renderClock();
      }
    });
  }

  function initSettings() {
    var settings = loadSettings();
    var form = $("settingsForm");

    var fields = {
      startTime: $("startTime"),
      endTime: $("endTime"),
      lunchEnabled: $("lunchEnabled"),
      lunchStart: $("lunchStart"),
      lunchEnd: $("lunchEnd"),
      lunchMinutes: $("lunchMinutes"),
      overtimeEnabled: $("overtimeEnabled"),
      overtimeEndTime: $("overtimeEndTime"),
      includeOvertimeInProgress: $("includeOvertimeInProgress")
    };

    Object.keys(fields).forEach(function (key) {
      if (fields[key].type === "checkbox") fields[key].checked = Boolean(settings[key]);
      else fields[key].value = settings[key];
    });

    function readForm() {
      return {
        startTime: fields.startTime.value,
        endTime: fields.endTime.value,
        lunchEnabled: fields.lunchEnabled.checked,
        lunchStart: fields.lunchStart.value,
        lunchEnd: fields.lunchEnd.value,
        lunchMinutes: Math.max(0, Math.min(240, Number(fields.lunchMinutes.value || 0))),
        overtimeEnabled: fields.overtimeEnabled.checked,
        overtimeEndTime: fields.overtimeEndTime.value,
        includeOvertimeInProgress: fields.includeOvertimeInProgress.checked
      };
    }

    function setDisabledStates() {
      var lunchDisabled = !fields.lunchEnabled.checked;
      [fields.lunchStart, fields.lunchEnd, fields.lunchMinutes].forEach(function (field) {
        field.disabled = lunchDisabled;
      });
      $("lunchFields").classList.toggle("is-disabled", lunchDisabled);

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
    }

    function updateLunchMinutesFromRange() {
      var minutes = offsetAfterStart(fields.lunchEnd.value, fields.lunchStart.value);
      fields.lunchMinutes.value = Math.min(240, minutes);
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
      return "";
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

      $("workDurationNote").textContent =
        "점심 제외 기준 " + formatDuration(regularMinutes) + " 근무예요.";
      $("lunchDurationNote").textContent = value.lunchEnabled
        ? value.lunchStart + "부터 " + value.lunchEnd + "까지, 총 " + value.lunchMinutes + "분이에요."
        : "점심시간을 사용하지 않아요.";
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
    }

    fields.lunchEnabled.addEventListener("change", function () {
      setDisabledStates();
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
      fields.endTime,
      fields.overtimeEndTime,
      fields.includeOvertimeInProgress
    ].forEach(function (field) {
      field.addEventListener("change", renderSummary);
    });

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

    setDisabledStates();
    renderSummary();
  }

  var page = document.body.dataset.page;
  if (page === "home") initHome();
  if (page === "settings") initSettings();
})();
