import { animate, createTimeline, stagger } from "./vendor/anime.esm.min.js";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const page = document.body.dataset.page || "";

document.documentElement.classList.add("anime-ready");

function play(targets, parameters) {
  if (reducedMotion || !targets || (targets.length !== undefined && targets.length === 0)) return null;
  return animate(targets, parameters);
}

function showLocalToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  play(toast, { opacity: [0, 1], y: [18, 0], duration: 240, ease: "out(3)" });
  window.clearTimeout(showLocalToast.timer);
  showLocalToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2200);
}

function pageEntrance() {
  if (reducedMotion) return;
  const timeline = createTimeline({ defaults: { ease: "out(3)", duration: 430 } });
  const headerItems = document.querySelectorAll("[data-page-enter] > *");
  if (headerItems.length) {
    timeline.add(headerItems, { opacity: [0, 1], y: [-10, 0], delay: stagger(45) }, 0);
  }

  if (page === "home") {
    timeline
      .add(".hero-card", { opacity: [0, 1], y: [16, 0] }, 70)
      .add(".clock-gauge", { opacity: [0, 1], scale: [0.97, 1], duration: 520 }, 130)
      .add(".clock-copy > *", { opacity: [0, 1], y: [9, 0], delay: stagger(55) }, 170)
      .add(".work-actions", { opacity: [0, 1], y: [8, 0] }, 280)
      .add(".interaction-hint", { opacity: [0, 1] }, 330);
  } else {
    const hero = document.querySelectorAll("[data-hero]");
    if (hero.length) timeline.add(hero, { opacity: [0, 1], y: [14, 0], delay: stagger(70) }, 80);
  }
}

function setupScrollReveals() {
  const targets = Array.from(document.querySelectorAll("[data-reveal]"));
  if (!targets.length) return;
  if (reducedMotion || !("IntersectionObserver" in window)) {
    targets.forEach((target) => { target.style.opacity = "1"; });
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const target = entry.target;
      play(target, { opacity: [0, 1], y: [20, 0], duration: 450, ease: "out(3)" });
      const rows = target.querySelectorAll(".bus-item, .vacation-item, .policy-row");
      if (rows.length) {
        play(rows, { opacity: [0, 1], y: [9, 0], delay: stagger(45), duration: 330, ease: "out(3)" });
      }
      observer.unobserve(target);
    });
  }, { rootMargin: "0px 0px -7% 0px", threshold: 0.08 });

  targets.forEach((target) => observer.observe(target));
}

function setupPressFeedback() {
  const selector = "button:not(:disabled), .icon-link, .logo-link, [data-page-link]";
  document.addEventListener("pointerdown", (event) => {
    const target = event.target.closest(selector);
    if (!target || reducedMotion) return;
    play(target, { scale: 0.97, duration: 90, ease: "out(2)" });
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach((type) => {
    document.addEventListener(type, (event) => {
      const target = event.target.closest?.(selector);
      if (!target || reducedMotion) return;
      play(target, { scale: 1, duration: 190, ease: "out(3)" });
    });
  });
}

function setupPageLinks() {
  document.querySelectorAll("[data-page-link]").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (reducedMotion || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (link.target === "_blank") return;
      event.preventDefault();
      const href = link.href;
      const shell = document.querySelector(".app-shell");
      const animation = play(shell, { opacity: [1, 0], y: [0, -8], duration: 180, ease: "in(2)" });
      if (animation) animation.then(() => { window.location.href = href; });
      else window.location.href = href;
    });
  });
}

const menus = {
  cafeteria: ["중식(뷔페) 메뉴", "한방돈수육&새우젓<br>새콤달콤비빔칼국수<br>소고기오색탕평채<br>마늘아몬드연근조림<br>모듬야채쌈장무침<br>시래기된장국<br>배추겉절이<br>그린그린샐러드<br>잡곡밥"],
  special: ["중식(일품) 메뉴", "매콤제육덮밥<br>반숙계란후라이<br>미니우동<br>양배추샐러드<br>단무지<br>배추김치"],
  bombom: ["봄봄 메뉴", "오늘의 한식 정식<br>구운 제철 채소<br>계절 국과 반찬<br>잡곡밥"],
  biwon: ["비원 메뉴", "오늘의 추천 메뉴<br>신선한 샐러드<br>수프와 곁들임<br>디저트"],
};

function setupLunchChips() {
  const chips = document.querySelectorAll("[data-menu]");
  const title = document.getElementById("menuTitle");
  const text = document.getElementById("menuText");
  if (!chips.length || !title || !text) return;
  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      chips.forEach((item) => item.classList.toggle("selected", item === chip));
      const content = menus[chip.dataset.menu];
      if (!content) return;
      const card = title.parentElement;
      const update = () => { title.textContent = content[0]; text.innerHTML = content[1]; };
      if (reducedMotion) return update();
      const out = play(card, { opacity: [1, 0], y: [0, 5], duration: 120, ease: "in(2)" });
      out.then(() => {
        update();
        play(card, { opacity: [0, 1], y: [5, 0], duration: 220, ease: "out(3)" });
      });
    });
  });
  document.getElementById("lunchLink")?.addEventListener("click", () => {
    showLocalToast("식당 인스타그램 연결은 다음 업데이트에서 제공할게요.");
  });
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function syncControl(input) {
  if (!input) return;
  if (input.type === "time") {
    const [hour = "00", minute = "00"] = (input.value || "00:00").split(":");
    document.querySelectorAll(`[data-time-hour="${input.id}"]`).forEach((node) => { node.textContent = hour; });
    document.querySelectorAll(`[data-time-minute="${input.id}"]`).forEach((node) => { node.textContent = minute; });
  }
  if (input.id === "workHours") {
    document.querySelectorAll('[data-number-value="workHours"]').forEach((node) => { node.textContent = input.value || "0"; });
  }
  if (input.id === "lunchMinutes") {
    const minutes = Math.max(0, Number(input.value || 0));
    document.querySelectorAll('[data-duration-hour="lunchMinutes"]').forEach((node) => { node.textContent = Math.floor(minutes / 60); });
    document.querySelectorAll('[data-duration-minute="lunchMinutes"]').forEach((node) => { node.textContent = minutes % 60; });
  }
  if (input.type === "date") {
    const display = document.querySelector(`[data-display-for="${input.id}"]`);
    if (display) display.textContent = input.value ? input.value.split("-").join(". ") + "." : "0000. 00. 00.";
  }
}

function setupDisplayInputs() {
  document.querySelectorAll(".display-input input").forEach((input) => {
    syncControl(input);
    ["input", "change"].forEach((eventName) => input.addEventListener(eventName, () => syncControl(input)));
  });
}

function chooseSegment(container, button) {
  container.querySelectorAll("button").forEach((item) => item.classList.toggle("selected", item === button));
  play(button, { scale: [0.96, 1], duration: 220, ease: "out(3)" });
}

function setupVacationSegments() {
  const periodGroup = document.querySelector(".day-segments");
  periodGroup?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-period-choice]");
    if (!button) return;
    chooseSegment(periodGroup, button);
    const start = document.getElementById("vacationStartPeriod");
    const end = document.getElementById("vacationEndPeriod");
    if (start) start.value = button.dataset.periodChoice;
    if (end) end.value = button.dataset.periodChoice;
    start?.dispatchEvent(new Event("change", { bubbles: true }));
  });

  const reasonGroup = document.querySelector(".reason-segments");
  const nonCharge = document.getElementById("vacationNonCharge");
  reasonGroup?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-special-choice]");
    if (!button) return;
    chooseSegment(reasonGroup, button);
    if (nonCharge) nonCharge.checked = true;
    const radio = document.querySelector(`input[name="vacationType"][value="${button.dataset.specialChoice}"]`);
    if (radio) { radio.checked = true; radio.dispatchEvent(new Event("change", { bubbles: true })); }
  });

  nonCharge?.addEventListener("change", () => {
    const selected = reasonGroup?.querySelector(".selected")?.dataset.specialChoice || "health";
    const value = nonCharge.checked ? selected : "full";
    const radio = document.querySelector(`input[name="vacationType"][value="${value}"]`);
    if (radio) { radio.checked = true; radio.dispatchEvent(new Event("change", { bubbles: true })); }
  });
}

function setupControlMotion() {
  document.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const visual = input.closest(".check-control")?.querySelector(".check-box") || input.closest(".switch")?.querySelector("span");
    if (visual) play(visual, { scale: [0.92, 1], duration: 230, ease: "out(3)" });
  });
}

function setupDynamicLists() {
  ["vacationList", "historyList"].forEach((id) => {
    const list = document.getElementById(id);
    if (!list) return;
    const observer = new MutationObserver(() => {
      if (list.closest("[hidden]")) return;
      const children = Array.from(list.children);
      play(children, { opacity: [0, 1], y: [8, 0], delay: stagger(45), duration: 280, ease: "out(3)" });
    });
    observer.observe(list, { childList: true });
  });
}

function setupModalMotion() {
  document.querySelectorAll("#attendanceDialog, #vacationFlowDialog").forEach((backdrop) => {
    const observer = new MutationObserver(() => {
      if (backdrop.hidden) return;
      const panel = backdrop.querySelector(".attendance-dialog, .bottom-sheet:not([hidden])");
      play(backdrop, { opacity: [0, 1], duration: 180, ease: "out(2)" });
      play(panel, { opacity: [0, 1], y: [28, 0], scale: [0.98, 1], duration: 320, ease: "out(3)" });
    });
    observer.observe(backdrop, { attributes: true, attributeFilter: ["hidden"] });
  });
}

pageEntrance();
setupScrollReveals();
setupPressFeedback();
setupPageLinks();
setupLunchChips();
setupDisplayInputs();
setupVacationSegments();
setupControlMotion();
setupDynamicLists();
setupModalMotion();
