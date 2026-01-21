(function () {
  "use strict";

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  // =========================
  // Seasons config（春夏秋冬：顶部渐变 + 特效颜色）
  // =========================
  const SEASONS = {
    spring: { topA: "#22c55e", topB: "#fb7185", fx: ["#fb7185", "#fda4af", "#86efac", "#22c55e"], mode: "petal" },
    summer: { topA: "#06b6d4", topB: "#3b82f6", fx: ["#22d3ee", "#60a5fa", "#a7f3d0", "#38bdf8"], mode: "glow" },
    autumn: { topA: "#f59e0b", topB: "#b45309", fx: ["#fb923c", "#f59e0b", "#b45309", "#fde68a"], mode: "leaf" },
    winter: { topA: "#60a5fa", topB: "#a5b4fc", fx: ["#ffffff", "#e5e7eb", "#bfdbfe", "#93c5fd"], mode: "snow" },
  };

  function seasonBySectionId(id) {
    if (id === "home") return "spring";
    if (id === "hobby") return "summer";
    if (id === "notes") return "autumn";
    if (id === "contact") return "winter";
    return "spring";
  }

  function setTopGradient(seasonKey) {
    const s = SEASONS[seasonKey] || SEASONS.spring;
    const r = document.documentElement.style;
    r.setProperty("--top-a", s.topA);
    r.setProperty("--top-b", s.topB);
  }

  // =========================
  // Background Cross-fade（你原来的）
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
  // Home hero：只重播动画，不换色（符合你要求：中间“你好，我是xianyu”颜色不变）
  // =========================
  function playHeroAnim() {
    document.body.classList.remove("hero-anim");
    void document.body.offsetWidth; // reflow
    document.body.classList.add("hero-anim");
    window.setTimeout(() => document.body.classList.remove("hero-anim"), 1600);
  }

  function setupHeroReplayOnEnter() {
    const home = qs("#home");
    const h1 = qs("#home .hero-title");
    if (!home || !h1) return;

    setTimeout(() => playHeroAnim(), 250);

    const io = new IntersectionObserver((entries) => {
      for (const ent of entries) {
        if (ent.isIntersecting && ent.intersectionRatio >= 0.6) {
          playHeroAnim();
        }
      }
    }, { threshold: [0.6] });

    io.observe(home);
  }

  // =========================
  // Season FX (canvas) — 自动创建，不用改 HTML
  // =========================
  function setupSeasonFx() {
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return { setSeason: () => {}, pause: () => {}, resume: () => {} };

    let canvas = qs("#seasonFx");
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.id = "seasonFx";
      canvas.setAttribute("aria-hidden", "true");
      document.body.prepend(canvas);
    }

    const ctx = canvas.getContext("2d");
    let W = 0, H = 0, DPR = 1;

    let seasonKey = "spring";
    let mode = SEASONS.spring.mode;
    let colors = SEASONS.spring.fx;

    const isMobile = matchMedia("(max-width: 820px)").matches;
    const MAX = isMobile ? 70 : 130;

    function resize() {
      DPR = Math.min(2, window.devicePixelRatio || 1);
      W = Math.floor(window.innerWidth);
      H = Math.floor(window.innerHeight);
      canvas.width = Math.floor(W * DPR);
      canvas.height = Math.floor(H * DPR);
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    window.addEventListener("resize", resize, { passive: true });
    resize();

    function rand(a, b) { return a + Math.random() * (b - a); }
    function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

    class Particle {
      constructor() { this.reset(true); }
      reset(first = false) {
        this.x = rand(0, W);
        this.y = first ? rand(0, H) : -rand(20, 200);
        this.vx = rand(-0.6, 0.8);
        this.vy = rand(0.6, 1.8);
        this.size = rand(2, 7);
        this.rot = rand(0, Math.PI * 2);
        this.vr = rand(-0.03, 0.03);
        this.alpha = rand(0.25, 0.75);
        this.color = pick(colors);
        // mode-specific tuning
        if (mode === "snow") {
          this.size = rand(1.5, 4.2);
          this.vy = rand(0.7, 1.9);
          this.vx = rand(-0.35, 0.35);
          this.alpha = rand(0.35, 0.9);
          this.color = pick(colors);
        }
        if (mode === "glow") {
          this.size = rand(6, 18);
          this.vy = rand(-0.25, 0.35);
          this.vx = rand(-0.35, 0.35);
          this.alpha = rand(0.08, 0.22);
          this.y = first ? rand(0, H) : rand(H + 40, H + 200);
        }
        if (mode === "leaf") {
          this.size = rand(6, 14);
          this.vy = rand(0.8, 2.1);
          this.vx = rand(-1.0, 1.0);
          this.alpha = rand(0.25, 0.65);
        }
        if (mode === "petal") {
          this.size = rand(4, 10);
          this.vy = rand(0.7, 1.8);
          this.vx = rand(-0.9, 0.9);
          this.alpha = rand(0.18, 0.55);
        }
      }
      step() {
        this.x += this.vx;
        this.y += this.vy;
        this.rot += this.vr;

        // gentle sway
        if (mode === "snow") this.x += Math.sin(this.y * 0.01) * 0.25;
        if (mode === "petal") this.x += Math.sin(this.y * 0.012) * 0.5;
        if (mode === "leaf") this.x += Math.sin(this.y * 0.01) * 0.8;

        // wrap / reset
        if (mode === "glow") {
          if (this.y < -60 || this.x < -80 || this.x > W + 80) this.reset(false);
        } else {
          if (this.y > H + 80 || this.x < -80 || this.x > W + 80) this.reset(false);
        }
      }
      draw() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rot);

        if (mode === "snow") {
          ctx.fillStyle = this.color;
          ctx.beginPath();
          ctx.arc(0, 0, this.size, 0, Math.PI * 2);
          ctx.fill();
        } else if (mode === "glow") {
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, this.size);
          g.addColorStop(0, this.color);
          g.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(0, 0, this.size, 0, Math.PI * 2);
          ctx.fill();
        } else if (mode === "leaf") {
          ctx.fillStyle = this.color;
          ctx.beginPath();
          ctx.moveTo(0, -this.size);
          ctx.quadraticCurveTo(this.size * 0.9, -this.size * 0.2, this.size * 0.4, this.size);
          ctx.quadraticCurveTo(0, this.size * 0.6, -this.size * 0.4, this.size);
          ctx.quadraticCurveTo(-this.size * 0.9, -this.size * 0.2, 0, -this.size);
          ctx.fill();
        } else { // petal
          ctx.fillStyle = this.color;
          ctx.beginPath();
          ctx.ellipse(0, 0, this.size * 0.75, this.size, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }
    }

    let particles = Array.from({ length: MAX }, () => new Particle());
    let raf = 0;
    let paused = false;

    function tick() {
      raf = requestAnimationFrame(tick);
      if (paused) return;

      ctx.clearRect(0, 0, W, H);

      // subtle overall fade for glow mode
      if (mode === "glow") {
        ctx.save();
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }

      for (const p of particles) {
        p.step();
        p.draw();
      }
    }

    function setSeason(nextKey) {
      if (!SEASONS[nextKey]) nextKey = "spring";
      if (nextKey === seasonKey) return;

      seasonKey = nextKey;
      mode = SEASONS[nextKey].mode;
      colors = SEASONS[nextKey].fx;

      // 重置粒子，让切换更“像换季”
      particles = Array.from({ length: MAX }, () => new Particle());
    }

    function pause() { paused = true; }
    function resume() { paused = false; }

    tick();

    return { setSeason, pause, resume };
  }

  // =========================
  // Photo gallery + blur-up + Lightbox
  // =========================
  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function markLoaded(img) {
    if (!img) return;
    img.classList.add("is-loaded");
  }

  async function renderPhotoGallery() {
    const host = qs("#photo-gallery");
    if (!host) return;

    host.innerHTML = '<p class="muted">正在加载照片…</p>';

    try {
      const res = await fetch("data/photos.json", { cache: "no-store" });
      if (!res.ok) throw new Error("fetch photos.json failed: " + res.status);

      const items = await res.json();
      if (!Array.isArray(items) || items.length === 0) {
        host.innerHTML = '<p class="muted">暂无照片。先往 /photos 放图片，再改 data/photos.json。</p>';
        return;
      }

      host.innerHTML = items.map((it, idx) => {
        const title = it.title || "未命名";
        const date = it.date || "";
        const src = it.src || "";
        const desc = it.desc || "";

        return `
          <div class="photo-card" data-idx="${idx}"
               data-title="${escapeHtml(title)}"
               data-date="${escapeHtml(date)}"
               data-src="${escapeHtml(src)}"
               data-desc="${escapeHtml(desc)}">
            <div class="photo-media">
              <img class="photo-img" src="${escapeHtml(src)}" alt="${escapeHtml(title)}" loading="lazy" decoding="async" />
            </div>
            <div class="photo-meta">
              <p class="photo-title">${escapeHtml(title)}</p>
              ${date ? `<div class="photo-date">${escapeHtml(date)}</div>` : ""}
              ${desc ? `<div class="photo-desc">${escapeHtml(desc)}</div>` : ""}
            </div>
          </div>
        `;
      }).join("");

      // blur-up：加载完成后变清晰
      qsa(".photo-img", host).forEach((img) => {
        if (img.complete) markLoaded(img);
        else img.addEventListener("load", () => markLoaded(img), { once: true });
      });

      // 点击卡片：打开 lightbox
      host.addEventListener("click", (e) => {
        const card = e.target && e.target.closest && e.target.closest(".photo-card");
        if (!card) return;

        const src = card.dataset.src || "";
        const title = card.dataset.title || "";
        const date = card.dataset.date || "";
        const desc = card.dataset.desc || "";

        openPhotoView({ src, title, date, desc });
      }, { passive: true });

    } catch (err) {
      console.error(err);
      host.innerHTML = '<p class="muted">加载失败：检查 data/photos.json 是否存在、JSON 是否有效、图片路径是否正确。</p>';
    }
  }

  function openPhotoView({ src, title, date, desc }) {
    const modal = qs("#modal-photo-view");
    if (!modal) return;

    const img = qs("#photo-view-img");
    const t = qs("#photo-view-title");
    const d = qs("#photo-view-date");
    const c = qs("#photo-view-desc");

    if (t) t.textContent = title || "";
    if (d) d.textContent = date || "";
    if (c) c.textContent = desc || "";

    if (img) {
      img.classList.remove("is-loaded");
      img.src = src || "";
      if (img.complete) markLoaded(img);
      else img.addEventListener("load", () => markLoaded(img), { once: true });
    }

    openModal(modal);
  }

  // =========================
  // 弹窗打开时：锁住一级页面(#snap)滚动，只允许弹窗内滚动（移动端稳版）
  // =========================
  let _unlockScroll = null;

  function lockSnapScroll() {
    const snap = qs("#snap");
    if (!snap) return;
    if (_unlockScroll) return;

    document.body.classList.add("modal-open");

    const snapTop = snap.scrollTop;

    // 1) 锁 snap
    snap.dataset.prevOverflowY = snap.style.overflowY || "";
    snap.style.overflowY = "hidden";

    // 2) 同时锁 html/body（防 iOS 回弹）
    const html = document.documentElement;
    const body = document.body;
    html.dataset.prevOverflow = html.style.overflow || "";
    body.dataset.prevOverflow = body.style.overflow || "";
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";

    // 3) 强制保持 snap 的 scrollTop
    const keepSnap = () => {
      if (snap.scrollTop !== snapTop) snap.scrollTop = snapTop;
    };
    snap.addEventListener("scroll", keepSnap, { passive: true });

    // 4) 阻断“弹窗空白处滑动带动背景”
    let startY = 0;

    const onTouchStart = (e) => {
      const panel = e.target && e.target.closest && e.target.closest(".modal-panel");
      if (!panel) return;
      startY = e.touches ? e.touches[0].clientY : 0;
    };

    const onTouchMove = (e) => {
      const panel = e.target && e.target.closest && e.target.closest(".modal-panel");

      // 不在 panel：遮罩/空白区域 => 阻止
      if (!panel) {
        e.preventDefault();
        return;
      }

      const curY = e.touches ? e.touches[0].clientY : startY;
      const dy = curY - startY;

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
      snap.style.overflowY = snap.dataset.prevOverflowY || "";
      delete snap.dataset.prevOverflowY;
      snap.removeEventListener("scroll", keepSnap);

      html.style.overflow = html.dataset.prevOverflow || "";
      body.style.overflow = body.dataset.prevOverflow || "";
      delete html.dataset.prevOverflow;
      delete body.dataset.prevOverflow;

      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);

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

    lockSnapScroll();

    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");

    if (modal.id === "modal-photo") {
      renderPhotoGallery();
    }

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

    // 如果没有任何弹窗打开了，再解锁
    if (!qs(".modal.open")) unlockSnapScroll();
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
  // 翻页切换季节：顶部渐变 + 特效
  // =========================
  function setupSeasonSwitcher(seasonFx) {
    const snap = qs("#snap");
    const sections = qsa(".section", snap);
    if (!snap || sections.length === 0) return;

    let cur = "";

    function pickCurrentSection() {
      // 用 “距离屏幕上方某个点最近的 section” 做判定，稳定
      const probeY = 140;
      let best = Infinity;
      let chosen = sections[0];

      for (const sec of sections) {
        const r = sec.getBoundingClientRect();
        const d = Math.abs(r.top - probeY);
        if (d < best) { best = d; chosen = sec; }
      }
      return chosen;
    }

    function applySeason() {
      const sec = pickCurrentSection();
      if (!sec) return;

      const nextSeason = seasonBySectionId(sec.id);
      if (nextSeason === cur) return;

      cur = nextSeason;
      setTopGradient(cur);
      seasonFx.setSeason(cur);
    }

    // 初始
    applySeason();

    let raf = 0;
    snap.addEventListener("scroll", () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(applySeason);
    }, { passive: true });
  }

  // =========================
  // 启动
  // =========================
  document.addEventListener("DOMContentLoaded", () => {
    setupNoBlueSelectionOnTap();
    setupHeroReplayOnEnter();

    const seasonFx = setupSeasonFx();
    setupSeasonSwitcher(seasonFx);

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
