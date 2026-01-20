// script.js（整段覆盖，可直接复制）
(function () {
  "use strict";

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  // =========================
  // Photo gallery
  // =========================
  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  async function renderPhotoGallery() {
    const host = qs("#photo-gallery");
    if (!host) return;

    host.innerHTML = '<p class="muted">正在加载照片…</p>';

    try {
      // ✅ 用 ./ 更稳（避免相对路径在某些场景被解析怪）
      const res = await fetch("./data/photos.json", { cache: "no-store" });
      if (!res.ok) throw new Error("fetch photos.json failed: " + res.status);

      const items = await res.json();
      if (!Array.isArray(items) || items.length === 0) {
        host.innerHTML = '<p class="muted">暂无照片。先往 /photos 放图片，再改 data/photos.json。</p>';
        return;
      }

      host.innerHTML = items.map((it) => {
        const title = it.title || "未命名";
        const date = it.date || "";
        const src = it.src || "";
        const desc = it.desc || "";

        return `
          <div class="photo-card">
            <img src="${src}" alt="${escapeHtml(title)}" loading="lazy" />
            <div class="photo-meta">
              <p class="photo-title">${escapeHtml(title)}</p>
              ${date ? `<div class="photo-date">${escapeHtml(date)}</div>` : ""}
              ${desc ? `<div class="photo-desc">${escapeHtml(desc)}</div>` : ""}
            </div>
          </div>
        `;
      }).join("");

    } catch (err) {
      console.error(err);
      host.innerHTML = '<p class="muted">加载失败：检查 data/photos.json 是否存在、JSON 是否有效、图片路径是否正确。</p>';
    }
  }

  // =========================
  // 弹窗打开时：锁住一级页面(#snap)滚动，只允许弹窗内滚动（移动端稳版）
  // =========================
  let _unlockScroll = null;

  function lockSnapScroll() {
    const snap = qs("#snap");
    if (!snap) return;
    if (_unlockScroll) return;

    const snapTop = snap.scrollTop;

    // ✅ 关键：让 CSS 的 body.modal-open 生效（防穿透规则靠它）
    document.body.classList.add("modal-open");

    // 1) 锁 snap 自己
    snap.dataset.prevOverflowY = snap.style.overflowY || "";
    snap.style.overflowY = "hidden";

    // 2) 同时锁 html/body（防止 iOS “滚动链/回弹”）
    const html = document.documentElement;
    const body = document.body;
    html.dataset.prevOverflow = html.style.overflow || "";
    body.dataset.prevOverflow = body.style.overflow || "";
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";

    // 3) 强制保持 snap 的 scrollTop（有些机型仍会被带动）
    const keepSnap = () => {
      if (snap.scrollTop !== snapTop) snap.scrollTop = snapTop;
    };
    snap.addEventListener("scroll", keepSnap, { passive: true });

    // 4) 防“滚动穿透”：遮罩/空白区域一律阻止；
    //    在 panel 内：到顶还下拉 / 到底还上推 => 阻止（防把背景带动）
    let startY = 0;

    const onTouchStart = (e) => {
      const panel = e.target && e.target.closest && e.target.closest(".modal-panel");
      if (!panel) return;
      startY = e.touches ? e.touches[0].clientY : 0;
    };

    const onTouchMove = (e) => {
      const panel = e.target && e.target.closest && e.target.closest(".modal-panel");

      // 不在弹窗内容里：一律阻止（遮罩/空白区域）
      if (!panel) {
        e.preventDefault();
        return;
      }

      const curY = e.touches ? e.touches[0].clientY : startY;
      const dy = curY - startY; // dy > 0 下拉，dy < 0 上推

      const canScroll = panel.scrollHeight > panel.clientHeight + 1;
      if (!canScroll) {
        e.preventDefault();
        return;
      }

      const atTop = panel.scrollTop <= 0;
      const atBottom = panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 1;

      if ((atTop && dy > 0) || (atBottom && dy < 0)) {
        e.preventDefault();
      }
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });

    _unlockScroll = () => {
      // 恢复 snap
      snap.style.overflowY = snap.dataset.prevOverflowY || "";
      delete snap.dataset.prevOverflowY;
      snap.removeEventListener("scroll", keepSnap);

      // 恢复 html/body
      html.style.overflow = html.dataset.prevOverflow || "";
      body.style.overflow = body.dataset.prevOverflow || "";
      delete html.dataset.prevOverflow;
      delete body.dataset.prevOverflow;

      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);

      // ✅ 关键：关闭时去掉 modal-open
      document.body.classList.remove("modal-open");

      _unlockScroll = null;
    };
  }

  function unlockSnapScroll() {
    if (_unlockScroll) _unlockScroll();
  }

  // =========================
  // 手机点击蓝色高亮 / 蓝色选中块（JS 补丁）
  // =========================
  function setupNoBlueSelectionOnTap() {
    const INTERACTIVE = "button, a, .tile, .icon-btn, .mini-btn, .nav a";

    document.addEventListener("selectstart", (e) => {
      if (e.target && e.target.closest && e.target.closest(INTERACTIVE)) {
        e.preventDefault();
      }
    });

    const clearSel = () => {
      const sel = window.getSelection && window.getSelection();
      if (sel && sel.removeAllRanges) sel.removeAllRanges();
    };

    document.addEventListener("pointerup", (e) => {
      const hit = e.target && e.target.closest && e.target.closest(INTERACTIVE);
      if (!hit) return;
      clearSel();
      setTimeout(() => {
        if (document.activeElement && document.activeElement.blur) {
          document.activeElement.blur();
        }
      }, 0);
    });

    const isEditable = (el) =>
      el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

    document.addEventListener("touchstart", (e) => {
      const t = e.target;
      if (isEditable(t)) return;
      if (t && t.closest && (t.closest(".modal-panel") || t.closest(".center-scroll"))) {
        document.body.classList.add("no-select");
      }
    }, { passive: true });

    document.addEventListener("touchend", () => {
      document.body.classList.remove("no-select");
    }, { passive: true });

    document.addEventListener("touchcancel", () => {
      document.body.classList.remove("no-select");
    }, { passive: true });
  }

  // =========================
  // Modal（含“闲时笔谈”同步）
  // =========================
  function openModal(modal) {
    if (!modal) return;

    // 先锁滚动再显示（更稳）
    lockSnapScroll();

    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");

    // 摄影：打开时加载相册
    if (modal.id === "modal-photo") {
      renderPhotoGallery();
    }

    // 笔谈：同步内容
    if (modal.id === "modal-notes") {
      const src = qs(".center-body");
      const dst = qs("#notes-modal-body");
      if (!src) return console.warn("[notes sync] 没找到 .center-body");
      if (!dst) return console.warn("[notes sync] 没找到 #notes-modal-body");
      dst.innerHTML = src.innerHTML;
      dst.scrollTop = 0;
    }
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    unlockSnapScroll();
  }

  // =========================
  // 背景 Cross-fade（丝滑）
  // =========================
  function createBgFader() {
    let current = getComputedStyle(document.documentElement)
      .getPropertyValue("--page-bg")
      .trim();
    let transitioning = false;

    function setVar(name, val) {
      document.documentElement.style.setProperty(name, val);
    }

    function fadeTo(nextBg) {
      if (!nextBg) return;
      if (nextBg === current) return;

      if (transitioning) {
        setVar("--page-bg-next", nextBg);
        return;
      }

      transitioning = true;
      setVar("--page-bg-next", nextBg);
      document.body.classList.add("bg-fading");

      const ms =
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bg-fade-ms")) ||
        900;

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
  // 中间笔谈：鼠标滚轮滚内容（不触发翻页）
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

      if ((scrollingDown && canScrollDown) || (scrollingUp && canScrollUp)) {
        e.preventDefault();
        e.stopPropagation();
        center.scrollTop += dy;
      }
    }, { passive: false });
  }

  // =========================
  // 强制翻页 + 背景联动（电脑滚轮用）
  // =========================
  function setupWheelPaging() {
    const snap = qs("#snap");
    if (!snap) return;

    const sections = qsa(".section", snap);
    if (sections.length === 0) return;

    const bg = createBgFader();

    function nearestIndex() {
      const probeY = 140;
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

    applyBgByIndex(nearestIndex());

    let raf = 0;
    snap.addEventListener("scroll", () => {
      if (qs(".modal.open")) return;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => applyBgByIndex(nearestIndex()));
    }, { passive: true });

    let locked = false;
    let lastTs = 0;

    function scrollToIndex(i) {
      const idx = Math.max(0, Math.min(sections.length - 1, i));
      const target = sections[idx];
      if (!target) return;

      applyBgByIndex(idx);
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    snap.addEventListener("wheel", (e) => {
      if (qs(".modal.open")) return;

      const now = Date.now();
      if (locked) { e.preventDefault(); return; }

      const dy = e.deltaY;
      if (Math.abs(dy) < 12) return;

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
    setupNoBlueSelectionOnTap();

    // 打开 modal
    qsa("[data-modal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-modal");
        if (!id) return;
        openModal(qs("#" + id));
      });
    });

    // 关闭 modal（按钮/遮罩）
    qsa(".modal").forEach((m) => {
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

    setupCenterWheelScroll();
    setupWheelPaging();
  });
})();
