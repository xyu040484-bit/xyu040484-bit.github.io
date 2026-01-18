// script.js（整段覆盖，可直接复制）
(function () {
  "use strict";

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  // =========================
  // Modal（含“闲时笔谈”同步）
  // =========================
  function openModal(modal) {
    if (!modal) return;

    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.documentElement.style.overflow = "hidden";

    // ✅ 打开“闲时笔谈”弹窗：把中间内容同步进去
    if (modal.id === "modal-notes") {
      const src = document.querySelector(".center-body");
      const dst = document.querySelector("#notes-modal-body");

      if (!src) {
        console.warn("[notes sync] 没找到 .center-body（检查 index.html 结构：笔谈内容必须在 .center-body 里）");
        return;
      }
      if (!dst) {
        console.warn("[notes sync] 没找到 #notes-modal-body（检查 modal-notes 是否存在且闭合）");
        return;
      }

      dst.innerHTML = src.innerHTML;
      dst.scrollTop = 0;
    }
  }

  function closeModal(modal) {
    if (!modal) return;

    // ✅ 可选：如果你希望“放大弹窗里改了内容，关闭后同步回小窗”，取消注释下面这段
    /*
    if (modal.id === "modal-notes") {
      const src = document.querySelector("#notes-modal-body");
      const dst = document.querySelector(".center-body");
      if (src && dst) dst.innerHTML = src.innerHTML;
    }
    */

    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.documentElement.style.overflow = "";
  }

  // =========================
  // 背景 Cross-fade（丝滑）
  // =========================
  function createBgFader() {
    let current = getComputedStyle(document.documentElement).getPropertyValue("--page-bg").trim();
    let transitioning = false;

    function setVar(name, val) {
      document.documentElement.style.setProperty(name, val);
    }

    function fadeTo(nextBg) {
      if (!nextBg) return;
      if (nextBg === current) return;

      // 过渡中：只更新目标
      if (transitioning) {
        setVar("--page-bg-next", nextBg);
        return;
      }

      transitioning = true;
      setVar("--page-bg-next", nextBg);
      document.body.classList.add("bg-fading");

      const ms = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bg-fade-ms")) || 900;

      setTimeout(() => {
        current = nextBg;
        setVar("--page-bg", current);
        document.body.classList.remove("bg-fading");
        transitioning = false;
      }, ms + 60);
    }

    return { fadeTo };
  }

  // =========================
  // 中间笔谈：鼠标在其上滚轮滚内容（不触发翻页）
  // =========================
  function setupCenterWheelScroll() {
    const center = qs(".center-scroll");
    const snap = qs("#snap");
    if (!center || !snap) return;

    center.addEventListener("wheel", (e) => {
      if (qs(".modal.open")) return;

      const dy = e.deltaY;
      if (Math.abs(dy) < 1) return;

      const atTop = center.scrollTop <= 0;
      const atBottom = center.scrollTop + center.clientHeight >= center.scrollHeight - 1;

      const scrollingDown = dy > 0;
      const scrollingUp = dy < 0;

      const canScrollDown = !atBottom;
      const canScrollUp = !atTop;

      // 如果 center 还能滚，就截断事件，避免外层翻页
      if ((scrollingDown && canScrollDown) || (scrollingUp && canScrollUp)) {
        e.preventDefault();
        e.stopPropagation();
        center.scrollTop += dy;
      }
      // 到顶/到底：放行，继续滚会触发外层翻页
    }, { passive: false });
  }

  // =========================
  // 强制翻页 + 背景联动
  // =========================
  function setupWheelPaging() {
    const snap = qs("#snap");
    if (!snap) return;

    const sections = qsa(".section", snap);
    if (sections.length === 0) return;

    const bg = createBgFader();

    function nearestIndex() {
      const probeY = 140; // 判定“当前屏”的位置
      let idx = 0, best = Infinity;
      sections.forEach((sec, i) => {
        const r = sec.getBoundingClientRect();
        const d = Math.abs(r.top - probeY);
        if (d < best) { best = d; idx = i; }
      });
      return idx;
    }

    function applyBgByIndex(i) {
      const sec = sections[Math.max(0, Math.min(sections.length - 1, i))];
      if (!sec) return;
      const next = sec.dataset.bg;
      if (next) bg.fadeTo(next);
    }

    // 初始化背景
    applyBgByIndex(nearestIndex());

    // 滚动条/触控板拖动时也跟随切背景（rAF 降频）
    let raf = 0;
    snap.addEventListener("scroll", () => {
      if (qs(".modal.open")) return;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => applyBgByIndex(nearestIndex()));
    }, { passive: true });

    // 滚轮强制翻页（每次一屏）
    let locked = false;
    let lastTs = 0;

    function scrollToIndex(i) {
      const idx = Math.max(0, Math.min(sections.length - 1, i));
      const target = sections[idx];
      if (!target) return;

      applyBgByIndex(idx); // 翻页前先切背景，更跟手
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    snap.addEventListener("wheel", (e) => {
      // 如果滚轮发生在 center-scroll，已经被 setupCenterWheelScroll 截断，不会到这里
      if (qs(".modal.open")) return;

      const now = Date.now();
      if (locked) { e.preventDefault(); return; }

      const dy = e.deltaY;
      if (Math.abs(dy) < 12) return;

      // 节流：防止连翻太快
      if (now - lastTs < 650) { e.preventDefault(); return; }
      lastTs = now;

      locked = true;
      e.preventDefault();

      const idx = nearestIndex();
      const next = dy > 0 ? idx + 1 : idx - 1;
      scrollToIndex(next);

      setTimeout(() => { locked = false; }, 700);
    }, { passive: false });
  }

  // =========================
  // 启动
  // =========================
  document.addEventListener("DOMContentLoaded", () => {
    // 打开 modal（tile / mini-btn 都走 data-modal）
    const openers = qsa("[data-modal]");
    openers.forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-modal");
        if (!id) return;
        openModal(qs("#" + id));
      });
    });

    // 关闭 modal（按钮/遮罩）
    const modals = qsa(".modal");
    modals.forEach((m) => {
      qsa("[data-close]", m).forEach((c) => {
        c.addEventListener("click", () => closeModal(m));
      });

      const backdrop = qs(".modal-backdrop", m);
      if (backdrop) backdrop.addEventListener("click", () => closeModal(m));
    });

    // Esc 关闭
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const opened = qs(".modal.open");
      if (opened) closeModal(opened);
    });

    // 中间笔谈滚轮滚动
    setupCenterWheelScroll();

    // 翻页 + 背景板变化
    setupWheelPaging();
  });
})();
