// script.js（整段覆盖，可直接复制）
(function () {
  "use strict";

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  // =========================
  // Seasons config（春夏秋冬：顶部渐变 + 特效颜色/模式）
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
  // Home hero：只重播动画，不换色（“你好，我是xianyu”颜色不变）
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
      const res = await fetch("data/photos.json", { cache: "no-store" });
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
  // 弹窗打开时：锁住一级页面(#snap)滚动（移动端防穿透稳版）
  // =========================
  let _unlockScroll = null;

  function lockSnapScroll() {
    const snap = qs("#snap");
    if (!snap) return;
    if (_unlockScroll) return;

    const snapTop = snap.scrollTop;

    // 给 CSS 用（你 CSS 里有 body.modal-open #snap { overflow:hidden }）
    document.body.classList.add("modal-open");

    // 1) 锁 snap 自己
    snap.dataset.prevOverflowY = snap.style.overflowY || "";
    snap.style.overflowY = "hidden";

    // 2) 同时锁 html/body（防 iOS 回弹/滚动链）
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

    // 4) 关键：阻断“弹窗空白处滑动带动背景”
    let startY = 0;

    const onTouchStart = (e) => {
      const panel = e.target && e.target.closest && e.target.closest(".modal-panel");
      if (!panel) return;
      startY = e.touches ? e.touches[0].clientY : 0;
    };

    const onTouchMove = (e) => {
      const panel = e.target && e.target.closest && e.target.closest(".modal-panel");

      // 不在弹窗内容里（遮罩/空白区域）=> 直接阻止
      if (!panel) {
        e.preventDefault();
        return;
      }

      const curY = e.touches ? e.touches[0].clientY : startY;
      const dy = curY - startY; // dy>0 下拉，dy<0 上推

      const canScroll = panel.scrollHeight > panel.clientHeight + 1;
      if (!canScroll) {
        e.preventDefault();
        return;
      }

      const atTop = panel.scrollTop <= 0;
      const atBottom = panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 1;

      // 顶部继续下拉 / 底部继续上推 => 阻止穿透
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
  // Season FX (canvas) — 更少/更慢/避开卡片
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

    // ✅ 更少：数量下降
    const isMobile = matchMedia("(max-width: 820px)").matches;
    const MAX = isMobile ? 8 : 40;

    // ✅ 排除区：当前视口内“主卡片”区域（扩大一点 margin）
    let exclude = { x0: 0, y0: 0, x1: 0, y1: 0, valid: false };

    function updateExcludeRect() {
      const cards = qsa(".section .card");
      let best = null;
      let bestArea = 0;

      for (const el of cards) {
        const r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) continue;

        const w = Math.max(0, Math.min(r.right, window.innerWidth) - Math.max(r.left, 0));
        const h = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
        const area = w * h;
        if (area > bestArea) { bestArea = area; best = r; }
      }

      if (!best) { exclude.valid = false; return; }

      const pad = isMobile ? 34 : 52;
      exclude.x0 = Math.max(0, best.left - pad);
      exclude.y0 = Math.max(0, best.top - pad);
      exclude.x1 = Math.min(window.innerWidth, best.right + pad);
      exclude.y1 = Math.min(window.innerHeight, best.bottom + pad);
      exclude.valid = true;
    }

    function resize() {
      DPR = Math.min(2, window.devicePixelRatio || 1);
      W = Math.floor(window.innerWidth);
      H = Math.floor(window.innerHeight);
      canvas.width = Math.floor(W * DPR);
      canvas.height = Math.floor(H * DPR);
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      updateExcludeRect();
    }
    window.addEventListener("resize", resize, { passive: true });
    resize();

    const snap = qs("#snap");
    if (snap) snap.addEventListener("scroll", () => updateExcludeRect(), { passive: true });

    function rand(a, b) { return a + Math.random() * (b - a); }
    function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
    function inExclude(x, y) {
      if (!exclude.valid) return false;
      return x >= exclude.x0 && x <= exclude.x1 && y >= exclude.y0 && y <= exclude.y1;
    }

    let seasonKey = "spring";
    let mode = SEASONS.spring.mode;
    let colors = SEASONS.spring.fx;

    // ✅ 生成点：偏向两侧/上方，并尽量避开卡片区
    function spawnPoint(first) {
      const edgeBias = 0.78;
      let x, y;

      const attempts = 22;
      for (let i = 0; i < attempts; i++) {
        if (Math.random() < edgeBias) {
          x = Math.random() < 0.5 ? rand(-40, W * 0.24) : rand(W * 0.76, W + 40);
        } else {
          x = rand(0, W);
        }

        if (mode === "glow") {
          y = first ? rand(0, H) : rand(H + 40, H + 220);
        } else {
          y = first ? rand(0, H) : -rand(30, 240);
        }

        if (!inExclude(x, y)) return { x, y };
      }

      x = rand(0, W);
      y = mode === "glow"
        ? (first ? rand(0, H) : rand(H + 40, H + 220))
        : (first ? rand(0, H) : -rand(30, 240));
      return { x, y };
    }

    class Particle {
      constructor() { this.reset(true); }
      reset(first = false) {
        const p = spawnPoint(first);
        this.x = p.x;
        this.y = p.y;

        // ✅ 更慢：整体速度下调
        this.vx = rand(-0.18, 0.22);
        this.vy = rand(0.28, 0.82);

        this.size = rand(2, 7);
        this.rot = rand(0, Math.PI * 2);
        this.vr = rand(-0.014, 0.014);
        this.alpha = rand(0.12, 0.42);
        this.color = pick(colors);

        if (mode === "snow") {
          this.size = rand(1.2, 2.8);
          this.vy = rand(0.22, 0.58);
          this.vx = rand(-0.12, 0.12);
          this.alpha = rand(0.18, 0.62);
          this.vr = rand(-0.01, 0.01);
        }

        if (mode === "glow") {
          this.size = rand(7, 13);
          this.vy = rand(-0.12, 0.14);
          this.vx = rand(-0.10, 0.10);
          this.alpha = rand(0.05, 0.11);
          this.vr = 0;
        }

        if (mode === "leaf") {
          this.size = rand(6, 11);
          this.vy = rand(0.26, 0.78);
          this.vx = rand(-0.28, 0.28);
          this.alpha = rand(0.10, 0.30);
          this.vr = rand(-0.012, 0.012);
        }

        if (mode === "petal") {
          this.size = rand(4, 8);
          this.vy = rand(0.28, 0.80);
          this.vx = rand(-0.28, 0.28);
          this.alpha = rand(0.10, 0.28);
          this.vr = rand(-0.014, 0.014);
        }
      }

      step() {
        this.x += this.vx;
        this.y += this.vy;
        this.rot += this.vr;

        // sway 更轻
        if (mode === "snow") this.x += Math.sin(this.y * 0.012) * 0.08;
        if (mode === "petal") this.x += Math.sin(this.y * 0.012) * 0.12;
        if (mode === "leaf") this.x += Math.sin(this.y * 0.010) * 0.16;

        if (mode === "glow") {
          if (this.y < -80 || this.x < -120 || this.x > W + 120) this.reset(false);
        } else {
          if (this.y > H + 100 || this.x < -120 || this.x > W + 120) this.reset(false);
        }
      }

      draw() {
        // ✅ 再保险：落在卡片区域就不画
        if (inExclude(this.x, this.y)) return;

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

      // glow：轻微空气感（更淡）
      if (mode === "glow") {
        ctx.save();
        ctx.globalAlpha = 0.04;
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

      updateExcludeRect();
      particles = Array.from({ length: MAX }, () => new Particle());
    }

    function pause() { paused = true; }
    function resume() { paused = false; }

    tick();
    return { setSeason, pause, resume };
  }

  // =========================
  // Modal（含“闲时笔谈”同步）
  // =========================
  let seasonFxRef = null;

  function openModal(modal) {
    if (!modal) return;

    lockSnapScroll();
    if (seasonFxRef) seasonFxRef.pause();

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

    // 如果没有任何弹窗打开了，再解锁 & 恢复特效
    if (!qs(".modal.open")) {
      unlockSnapScroll();
      if (seasonFxRef) seasonFxRef.resume();
    }
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

    seasonFxRef = setupSeasonFx();
    setupSeasonSwitcher(seasonFxRef);

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
