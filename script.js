(function () {
  "use strict";

  // =========================
  // 0. 基础工具
  // =========================
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  // =========================
  // 1. 核心动画控制
  // =========================
  function playHeroAnim() {
    const home = qs("#home");
    if (!home) return;
    home.classList.remove("anim-active");
    document.body.classList.remove("hero-anim");
    void home.offsetWidth; 
    home.classList.add("anim-active");
    document.body.classList.add("hero-anim");
  }

  function setupHeroReplayOnEnter() {
    const splash = qs("#intro-splash");
    const hasSeen = sessionStorage.getItem("hasSeenIntro");

    if (hasSeen) {
      if (splash) splash.remove();
      playHeroAnim();
    } else {
      setTimeout(() => {
        if (splash) {
          splash.classList.add("fade-out");
          setTimeout(() => splash.remove(), 600);
        }
        playHeroAnim();
        sessionStorage.setItem("hasSeenIntro", "true");
      }, 2200);
    }

    const io = new IntersectionObserver((entries) => {
      for (const ent of entries) {
        if (ent.isIntersecting && ent.intersectionRatio >= 0.6) {
          playHeroAnim();
        }
      }
    }, { threshold: 0.6 });

    const homeSec = qs("#home");
    if (homeSec) io.observe(homeSec);
  }

  // =========================
  // 2. 四季配置
  // =========================
  const SEASONS = {
    spring: { topA: "#22c55e", topB: "#fb7185", fx: ["#fb7185", "#fda4af", "#86efac", "#22c55e"], mode: "petal" },
    summer: { topA: "#06b6d4", topB: "#3b82f6", fx: ["#22d3ee", "#60a5fa", "#a7f3d0", "#38bdf8"], mode: "glow" },
    autumn: { topA: "#f59e0b", topB: "#b45309", fx: ["#fb923c", "#f59e0b", "#b45309", "#fde68a"], mode: "leaf" },
    winter: { topA: "#60a5fa", topB: "#a5b4fc", fx: ["#7dd3fc", "#93c5fd", "#bae6fd", "#3b82f6"], mode: "snow" },
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
  // 3. 背景渐变
  // =========================
  function createBgFader() {
    let current = getComputedStyle(document.documentElement).getPropertyValue("--page-bg").trim();
    let transitioning = false;

    function setVar(name, val) {
      document.documentElement.style.setProperty(name, val);
    }

    function fadeTo(nextBg) {
      if (!nextBg || nextBg === current) return;
      if (transitioning) { setVar("--page-bg-next", nextBg); return; }
      
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
  // 4. 滚动锁定
  // =========================
  let _unlockScroll = null;

  function lockSnapScroll() {
    const snap = qs("#snap");
    if (!snap) return;
    if (_unlockScroll) return;

    const snapTop = snap.scrollTop;
    document.body.classList.add("modal-open");

    snap.dataset.prevOverflowY = snap.style.overflowY || "";
    snap.style.overflowY = "hidden";

    const html = document.documentElement;
    const body = document.body;
    html.dataset.prevOverflow = html.style.overflow || "";
    body.dataset.prevOverflow = body.style.overflow || "";
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";

    const keepSnap = () => {
      if (snap.scrollTop !== snapTop) snap.scrollTop = snapTop;
    };
    snap.addEventListener("scroll", keepSnap, { passive: true });

    let startY = 0;
    const onTouchStart = (e) => {
      const panel = e.target && e.target.closest && e.target.closest(".modal-panel");
      if (!panel) return;
      startY = e.touches ? e.touches[0].clientY : 0;
    };

    const onTouchMove = (e) => {
      const panel = e.target && e.target.closest && e.target.closest(".modal-panel");
      if (!panel) { e.preventDefault(); return; }

      const curY = e.touches ? e.touches[0].clientY : startY;
      const dy = curY - startY; 
      const canScroll = panel.scrollHeight > panel.clientHeight + 1;
      
      if (!canScroll) { e.preventDefault(); return; }
      
      const atTop = panel.scrollTop <= 0;
      const atBottom = panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 1;

      if ((atTop && dy > 0) || (atBottom && dy < 0)) { e.preventDefault(); }
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
  // 5. 手机端优化
  // =========================
  function setupNoBlueSelectionOnTap() {
    const INTERACTIVE = "button, a, .tile, .icon-btn, .mini-btn, .nav a";
    document.addEventListener("selectstart", (e) => {
      if (e.target && e.target.closest && e.target.closest(INTERACTIVE)) e.preventDefault();
    });
    
    document.addEventListener("pointerup", (e) => {
      if (e.target && e.target.closest && e.target.closest(INTERACTIVE)) {
        setTimeout(() => {
          if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        }, 0);
      }
    });

    document.addEventListener("contextmenu", (e) => {
      if(e.target.closest("img")) e.preventDefault();
    });
  }

  // =========================
  // 6. 粒子特效
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
    const isMobile = matchMedia("(max-width: 820px)").matches;
    const MAX = isMobile ? 12 : 45; 
    let exclude = { x0: 0, y0: 0, x1: 0, y1: 0, valid: false };

    function updateExcludeRect() {
      const cards = qsa(".section .card");
      let best = null, bestArea = 0;
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

    function spawnPoint(first) {
      const edgeBias = 0.78;
      let x, y;
      for (let i = 0; i < 22; i++) {
        if (Math.random() < edgeBias) x = Math.random() < 0.5 ? rand(-40, W * 0.24) : rand(W * 0.76, W + 40);
        else x = rand(0, W);
        if (mode === "glow") y = first ? rand(0, H) : rand(H + 40, H + 220);
        else y = first ? rand(0, H) : -rand(30, 240);
        if (!inExclude(x, y)) return { x, y };
      }
      x = rand(0, W);
      y = mode === "glow" ? (first ? rand(0, H) : rand(H + 40, H + 220)) : (first ? rand(0, H) : -rand(30, 240));
      return { x, y };
    }

    class Particle {
      constructor() { this.reset(true); }
      reset(first = false) {
        const p = spawnPoint(first);
        this.x = p.x; this.y = p.y;
        
        this.vx = rand(-0.10, 0.12); 
        this.vy = rand(0.18, 0.52);

        this.size = rand(2, 7); 
        this.rot = rand(0, Math.PI * 2);
        this.vr = rand(-0.008, 0.008); 
        this.alpha = rand(0.12, 0.42);
        this.color = pick(colors);

        if (mode === "snow") { 
          this.size = rand(3, 6); this.vy = rand(0.3, 0.7); this.vx = rand(-0.2, 0.2);
          this.alpha = rand(0.5, 0.9); this.vr = rand(-0.01, 0.01); 
        }
        if (mode === "glow") { 
          this.size = rand(4, 10); this.vy = rand(-0.15, 0.15); this.vx = rand(-0.15, 0.15);
          this.alpha = rand(0.2, 0.5); this.vr = 0;
        }
        if (mode === "leaf") { 
          this.size = rand(6, 11); this.vy = rand(0.2, 0.6); this.vx = rand(-0.2, 0.2); 
          this.alpha = rand(0.10, 0.30); this.vr = rand(-0.01, 0.01); 
        }
        if (mode === "petal") { 
          this.size = rand(4, 8); this.vy = rand(0.2, 0.6); this.vx = rand(-0.2, 0.2); 
          this.alpha = rand(0.10, 0.28); this.vr = rand(-0.01, 0.01); 
        }
      }
      step() {
        this.x += this.vx; this.y += this.vy; this.rot += this.vr;
        if (mode === "snow") this.x += Math.sin(this.y * 0.012) * 0.2; 
        if (mode === "petal") this.x += Math.sin(this.y * 0.012) * 0.12;
        if (mode === "leaf") this.x += Math.sin(this.y * 0.010) * 0.16;
        if (mode === "glow") { if (this.y < -80 || this.x < -120 || this.x > W + 120) this.reset(false); }
        else { if (this.y > H + 100 || this.x < -120 || this.x > W + 120) this.reset(false); }
      }
      draw() {
        if (inExclude(this.x, this.y)) return;
        ctx.save(); ctx.globalAlpha = this.alpha; ctx.translate(this.x, this.y); ctx.rotate(this.rot);
        if (mode === "snow") { ctx.fillStyle = this.color; ctx.beginPath(); ctx.arc(0, 0, this.size, 0, Math.PI * 2); ctx.fill(); }
        else if (mode === "glow") { ctx.shadowBlur = 8; ctx.shadowColor = this.color; ctx.fillStyle = this.color; ctx.beginPath(); ctx.arc(0, 0, this.size, 0, Math.PI * 2); ctx.fill(); }
        else if (mode === "leaf") { ctx.fillStyle = this.color; ctx.beginPath(); ctx.moveTo(0, -this.size); ctx.quadraticCurveTo(this.size * 0.9, -this.size * 0.2, this.size * 0.4, this.size); ctx.quadraticCurveTo(0, this.size * 0.6, -this.size * 0.4, this.size); ctx.quadraticCurveTo(-this.size * 0.9, -this.size * 0.2, 0, -this.size); ctx.fill(); }
        else { ctx.fillStyle = this.color; ctx.beginPath(); ctx.ellipse(0, 0, this.size * 0.75, this.size, 0, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      }
    }

    let particles = Array.from({ length: MAX }, () => new Particle());
    let raf = 0, paused = false;
    function tick() {
      raf = requestAnimationFrame(tick);
      if (paused) return;
      ctx.clearRect(0, 0, W, H);
      for (const p of particles) { p.step(); p.draw(); }
    }
    function setSeason(nextKey) {
      if (!SEASONS[nextKey]) nextKey = "spring";
      if (nextKey === seasonKey) return;
      seasonKey = nextKey; mode = SEASONS[nextKey].mode; colors = SEASONS[nextKey].fx;
      updateExcludeRect(); particles = Array.from({ length: MAX }, () => new Particle());
    }
    function pause() { paused = true; }
    function resume() { paused = false; }
    tick();
    return { setSeason, pause, resume };
  }

  // =========================
  // 7. Modal Control
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
      if (src && dst) dst.innerHTML = src.innerHTML;
    }
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");

    if (!qs(".modal.open")) {
      unlockSnapScroll();
      if (seasonFxRef) seasonFxRef.resume();
    }
  }

  function setupModals() {
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-modal]");
      if (btn) {
        const id = btn.dataset.modal;
        openModal(qs("#" + id));
      }
      if (e.target.matches("[data-close]") || e.target.closest("[data-close]") || e.target.classList.contains("modal-backdrop")) {
        const m = e.target.closest(".modal");
        closeModal(m);
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const m = qs(".modal.open") || qs(".modal.active");
        if (m) closeModal(m);
      }
    });
  }

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
      if ((dy > 0 && !atBottom) || (dy < 0 && !atTop)) {
        e.preventDefault(); e.stopPropagation(); center.scrollTop += dy;
      }
    }, { passive: false });
  }

  // ✅ 核心修复：纯原生防抖动翻页 (Debounce Scroll)
  function setupWheelPaging() {
    const snap = qs("#snap");
    if (!snap) return;
    const sections = qsa(".section", snap);
    if (!sections.length) return;
    const bg = createBgFader();
    
    function nearestIndex() {
      const probeY = 140; let idx = 0, best = Infinity;
      sections.forEach((sec, i) => {
        const r = sec.getBoundingClientRect(); const d = Math.abs(r.top - probeY);
        if (d < best) { best = d; idx = i; }
      });
      return idx;
    }
    
    // 只负责背景切换，不控制滚动
    function applyBgByIndex(i) {
      const sec = sections[Math.max(0, Math.min(sections.length - 1, i))];
      if (sec && sec.dataset.bg) bg.fadeTo(sec.dataset.bg);
    }
    
    applyBgByIndex(nearestIndex());
    let raf = 0;
    snap.addEventListener("scroll", () => {
      if (qs(".modal.open")) return;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => applyBgByIndex(nearestIndex()));
    }, { passive: true });

    // ✅ 防连跳逻辑：滚轮滚动时，强制等待 1秒 才能再次生效
    let isScrolling = false;
    let wheelTimer = null;

    snap.addEventListener("wheel", (e) => {
      if (qs(".modal.open")) return;
      
      // 如果正在滚动中（锁定），直接忽略这次操作
      if (isScrolling) {
        e.preventDefault();
        return;
      }

      const dy = e.deltaY;
      // 忽略微小触控板抖动
      if (Math.abs(dy) < 15) return;

      // 锁定状态：开始翻页
      isScrolling = true;
      e.preventDefault(); // 阻止浏览器默认连续滚动

      const idx = nearestIndex();
      const next = dy > 0 ? idx + 1 : idx - 1;
      const target = sections[Math.max(0, Math.min(sections.length - 1, next))];

      if (target) {
        applyBgByIndex(next);
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }

      // ✅ 1.2秒后解锁，允许下次翻页 (时间越长越不容易连跳)
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => {
        isScrolling = false;
      }, 1200); 

    }, { passive: false });
  }

  function setupSeasonSwitcher(seasonFx) {
    const snap = qs("#snap");
    const sections = qsa(".section", snap);
    if (!snap || !sections.length) return;
    let cur = "";
    function applySeason() {
      const center = window.innerHeight / 2;
      let chosen = sections[0], best = Infinity;
      sections.forEach(sec => {
        const r = sec.getBoundingClientRect();
        const d = Math.abs(r.top + r.height / 2 - center);
        if (d < best) { best = d; chosen = sec; }
      });
      const next = seasonBySectionId(chosen.id);
      if (next !== cur) { cur = next; setTopGradient(cur); seasonFx.setSeason(cur); }
    }
    applySeason();
    snap.addEventListener("scroll", () => requestAnimationFrame(applySeason), { passive: true });
  }

  // =========================
  // 8. 摄影画廊
  // =========================
 (function () {
  "use strict";

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function playHeroAnim() {
    const home = qs("#home");
    if (!home) return;
    home.classList.remove("anim-active");
    document.body.classList.remove("hero-anim");
    void home.offsetWidth; 
    home.classList.add("anim-active");
    document.body.classList.add("hero-anim");
  }

  function setupHeroReplayOnEnter() {
    const splash = qs("#intro-splash");
    const hasSeen = sessionStorage.getItem("hasSeenIntro");
    if (hasSeen) {
      if (splash) splash.remove();
      playHeroAnim();
    } else {
      setTimeout(() => {
        if (splash) {
          splash.classList.add("fade-out");
          setTimeout(() => splash.remove(), 600);
        }
        playHeroAnim();
        sessionStorage.setItem("hasSeenIntro", "true");
      }, 2200);
    }
    const io = new IntersectionObserver((entries) => {
      for (const ent of entries) {
        if (ent.isIntersecting && ent.intersectionRatio >= 0.6) {
          playHeroAnim();
        }
      }
    }, { threshold: 0.6 });
    const homeSec = qs("#home");
    if (homeSec) io.observe(homeSec);
  }

  const SEASONS = {
    spring: { topA: "#22c55e", topB: "#fb7185", fx: ["#fb7185", "#fda4af", "#86efac", "#22c55e"], mode: "petal" },
    summer: { topA: "#06b6d4", topB: "#3b82f6", fx: ["#22d3ee", "#60a5fa", "#a7f3d0", "#38bdf8"], mode: "glow" },
    autumn: { topA: "#f59e0b", topB: "#b45309", fx: ["#fb923c", "#f59e0b", "#b45309", "#fde68a"], mode: "leaf" },
    winter: { topA: "#60a5fa", topB: "#a5b4fc", fx: ["#7dd3fc", "#93c5fd", "#bae6fd", "#3b82f6"], mode: "snow" },
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

  function createBgFader() {
    let current = getComputedStyle(document.documentElement).getPropertyValue("--page-bg").trim();
    let transitioning = false;
    function setVar(name, val) { document.documentElement.style.setProperty(name, val); }
    function fadeTo(nextBg) {
      if (!nextBg || nextBg === current) return;
      if (transitioning) { setVar("--page-bg-next", nextBg); return; }
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

  let _unlockScroll = null;
  function lockSnapScroll() {
    const snap = qs("#snap");
    if (!snap) return;
    if (_unlockScroll) return;
    const snapTop = snap.scrollTop;
    document.body.classList.add("modal-open");
    snap.dataset.prevOverflowY = snap.style.overflowY || "";
    snap.style.overflowY = "hidden";
    const html = document.documentElement;
    const body = document.body;
    html.dataset.prevOverflow = html.style.overflow || "";
    body.dataset.prevOverflow = body.style.overflow || "";
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    const keepSnap = () => { if (snap.scrollTop !== snapTop) snap.scrollTop = snapTop; };
    snap.addEventListener("scroll", keepSnap, { passive: true });
    let startY = 0;
    const onTouchStart = (e) => {
      const panel = e.target && e.target.closest && e.target.closest(".modal-panel");
      if (!panel) return;
      startY = e.touches ? e.touches[0].clientY : 0;
    };
    const onTouchMove = (e) => {
      const panel = e.target && e.target.closest && e.target.closest(".modal-panel");
      if (!panel) { e.preventDefault(); return; }
      const curY = e.touches ? e.touches[0].clientY : startY;
      const dy = curY - startY; 
      const canScroll = panel.scrollHeight > panel.clientHeight + 1;
      if (!canScroll) { e.preventDefault(); return; }
      const atTop = panel.scrollTop <= 0;
      const atBottom = panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 1;
      if ((atTop && dy > 0) || (atBottom && dy < 0)) { e.preventDefault(); }
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
  function unlockSnapScroll() { if (_unlockScroll) _unlockScroll(); }

  function setupNoBlueSelectionOnTap() {
    const INTERACTIVE = "button, a, .tile, .icon-btn, .mini-btn, .nav a";
    document.addEventListener("selectstart", (e) => { if (e.target && e.target.closest && e.target.closest(INTERACTIVE)) e.preventDefault(); });
    document.addEventListener("pointerup", (e) => { if (e.target && e.target.closest && e.target.closest(INTERACTIVE)) { setTimeout(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }, 0); } });
    document.addEventListener("contextmenu", (e) => { if(e.target.closest("img")) e.preventDefault(); });
  }

  function setupSeasonFx() {
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return { setSeason: () => {}, pause: () => {}, resume: () => {} };
    let canvas = qs("#seasonFx");
    if (!canvas) { canvas = document.createElement("canvas"); canvas.id = "seasonFx"; canvas.setAttribute("aria-hidden", "true"); document.body.prepend(canvas); }
    const ctx = canvas.getContext("2d");
    let W = 0, H = 0, DPR = 1;
    const isMobile = matchMedia("(max-width: 820px)").matches;
    const MAX = isMobile ? 12 : 45; 
    let exclude = { x0: 0, y0: 0, x1: 0, y1: 0, valid: false };
    function updateExcludeRect() {
      const cards = qsa(".section .card");
      let best = null, bestArea = 0;
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
    function resize() { DPR = Math.min(2, window.devicePixelRatio || 1); W = Math.floor(window.innerWidth); H = Math.floor(window.innerHeight); canvas.width = Math.floor(W * DPR); canvas.height = Math.floor(H * DPR); canvas.style.width = W + "px"; canvas.style.height = H + "px"; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); updateExcludeRect(); }
    window.addEventListener("resize", resize, { passive: true }); resize();
    const snap = qs("#snap"); if (snap) snap.addEventListener("scroll", () => updateExcludeRect(), { passive: true });
    function rand(a, b) { return a + Math.random() * (b - a); }
    function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
    function inExclude(x, y) { if (!exclude.valid) return false; return x >= exclude.x0 && x <= exclude.x1 && y >= exclude.y0 && y <= exclude.y1; }
    let seasonKey = "spring"; let mode = SEASONS.spring.mode; let colors = SEASONS.spring.fx;
    function spawnPoint(first) {
      const edgeBias = 0.78; let x, y;
      for (let i = 0; i < 22; i++) {
        if (Math.random() < edgeBias) x = Math.random() < 0.5 ? rand(-40, W * 0.24) : rand(W * 0.76, W + 40); else x = rand(0, W);
        if (mode === "glow") y = first ? rand(0, H) : rand(H + 40, H + 220); else y = first ? rand(0, H) : -rand(30, 240);
        if (!inExclude(x, y)) return { x, y };
      }
      x = rand(0, W); y = mode === "glow" ? (first ? rand(0, H) : rand(H + 40, H + 220)) : (first ? rand(0, H) : -rand(30, 240));
      return { x, y };
    }
    class Particle {
      constructor() { this.reset(true); }
      reset(first = false) {
        const p = spawnPoint(first); this.x = p.x; this.y = p.y;
        this.vx = rand(-0.10, 0.12); this.vy = rand(0.18, 0.52);
        this.size = rand(2, 7); this.rot = rand(0, Math.PI * 2);
        this.vr = rand(-0.008, 0.008); this.alpha = rand(0.12, 0.42); this.color = pick(colors);
        if (mode === "snow") { this.size = rand(3, 6); this.vy = rand(0.3, 0.7); this.vx = rand(-0.2, 0.2); this.alpha = rand(0.5, 0.9); this.vr = rand(-0.01, 0.01); }
        if (mode === "glow") { this.size = rand(4, 10); this.vy = rand(-0.15, 0.15); this.vx = rand(-0.15, 0.15); this.alpha = rand(0.2, 0.5); this.vr = 0; }
        if (mode === "leaf") { this.size = rand(6, 11); this.vy = rand(0.2, 0.6); this.vx = rand(-0.2, 0.2); this.alpha = rand(0.10, 0.30); this.vr = rand(-0.01, 0.01); }
        if (mode === "petal") { this.size = rand(4, 8); this.vy = rand(0.2, 0.6); this.vx = rand(-0.2, 0.2); this.alpha = rand(0.10, 0.28); this.vr = rand(-0.01, 0.01); }
      }
      step() {
        this.x += this.vx; this.y += this.vy; this.rot += this.vr;
        if (mode === "snow") this.x += Math.sin(this.y * 0.012) * 0.2; if (mode === "petal") this.x += Math.sin(this.y * 0.012) * 0.12; if (mode === "leaf") this.x += Math.sin(this.y * 0.010) * 0.16;
        if (mode === "glow") { if (this.y < -80 || this.x < -120 || this.x > W + 120) this.reset(false); } else { if (this.y > H + 100 || this.x < -120 || this.x > W + 120) this.reset(false); }
      }
      draw() {
        if (inExclude(this.x, this.y)) return;
        ctx.save(); ctx.globalAlpha = this.alpha; ctx.translate(this.x, this.y); ctx.rotate(this.rot);
        if (mode === "snow") { ctx.fillStyle = this.color; ctx.beginPath(); ctx.arc(0, 0, this.size, 0, Math.PI * 2); ctx.fill(); }
        else if (mode === "glow") { ctx.shadowBlur = 8; ctx.shadowColor = this.color; ctx.fillStyle = this.color; ctx.beginPath(); ctx.arc(0, 0, this.size, 0, Math.PI * 2); ctx.fill(); }
        else if (mode === "leaf") { ctx.fillStyle = this.color; ctx.beginPath(); ctx.moveTo(0, -this.size); ctx.quadraticCurveTo(this.size * 0.9, -this.size * 0.2, this.size * 0.4, this.size); ctx.quadraticCurveTo(0, this.size * 0.6, -this.size * 0.4, this.size); ctx.quadraticCurveTo(-this.size * 0.9, -this.size * 0.2, 0, -this.size); ctx.fill(); }
        else { ctx.fillStyle = this.color; ctx.beginPath(); ctx.ellipse(0, 0, this.size * 0.75, this.size, 0, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      }
    }
    let particles = Array.from({ length: MAX }, () => new Particle());
    let raf = 0, paused = false;
    function tick() { raf = requestAnimationFrame(tick); if (paused) return; ctx.clearRect(0, 0, W, H); for (const p of particles) { p.step(); p.draw(); } }
    function setSeason(nextKey) { if (!SEASONS[nextKey]) nextKey = "spring"; if (nextKey === seasonKey) return; seasonKey = nextKey; mode = SEASONS[nextKey].mode; colors = SEASONS[nextKey].fx; updateExcludeRect(); particles = Array.from({ length: MAX }, () => new Particle()); }
    function pause() { paused = true; } function resume() { paused = false; }
    tick(); return { setSeason, pause, resume };
  }

  function setupSeasonSwitcher(seasonFx) {
    const snap = qs("#snap"); const sections = qsa(".section", snap); if (!snap || !sections.length) return;
    let cur = "";
    function applySeason() {
      const center = window.innerHeight / 2; let chosen = sections[0], best = Infinity;
      sections.forEach(sec => { const r = sec.getBoundingClientRect(); const d = Math.abs(r.top + r.height / 2 - center); if (d < best) { best = d; chosen = sec; } });
      const next = seasonBySectionId(chosen.id); if (next !== cur) { cur = next; setTopGradient(cur); seasonFx.setSeason(cur); }
    }
    applySeason();
    snap.addEventListener("scroll", () => requestAnimationFrame(applySeason), { passive: true });
  }

  let seasonFxRef = null;
  function openModal(modal) {
    if (!modal) return;
    lockSnapScroll();
    if (seasonFxRef) seasonFxRef.pause();
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    if (modal.id === "modal-photo") { renderPhotoGallery(); }
    if (modal.id === "modal-notes") { const src = qs(".center-body"); const dst = qs("#notes-modal-body"); if (src && dst) dst.innerHTML = src.innerHTML; }
  }
  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    if (!qs(".modal.open")) { unlockSnapScroll(); if (seasonFxRef) seasonFxRef.resume(); }
  }
  function setupModals() {
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-modal]"); if (btn) { const id = btn.dataset.modal; openModal(qs("#" + id)); }
      if (e.target.matches("[data-close]") || e.target.closest("[data-close]") || e.target.classList.contains("modal-backdrop")) { const m = e.target.closest(".modal"); closeModal(m); }
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") { const m = qs(".modal.open") || qs(".modal.active"); if (m) closeModal(m); } });
  }

  function setupCenterWheelScroll() {
    const center = qs(".center-scroll"); const snap = qs("#snap"); if (!center || !snap) return;
    center.addEventListener("wheel", (e) => {
      if (qs(".modal.open")) return;
      const dy = e.deltaY; if (Math.abs(dy) < 1) return;
      const atTop = center.scrollTop <= 0; const atBottom = center.scrollTop + center.clientHeight >= center.scrollHeight - 1;
      if ((dy > 0 && !atBottom) || (dy < 0 && !atTop)) { e.preventDefault(); e.stopPropagation(); center.scrollTop += dy; }
    }, { passive: false });
  }

  function setupWheelPaging() {
    const snap = qs("#snap"); if (!snap) return; const sections = qsa(".section", snap); if (!sections.length) return;
    const bg = createBgFader();
    function nearestIndex() {
      const probeY = 140; let idx = 0, best = Infinity;
      sections.forEach((sec, i) => { const r = sec.getBoundingClientRect(); const d = Math.abs(r.top - probeY); if (d < best) { best = d; idx = i; } });
      return idx;
    }
    function applyBgByIndex(i) { const sec = sections[Math.max(0, Math.min(sections.length - 1, i))]; if (sec && sec.dataset.bg) bg.fadeTo(sec.dataset.bg); }
    applyBgByIndex(nearestIndex());
    let raf = 0;
    snap.addEventListener("scroll", () => { if (qs(".modal.open")) return; if (raf) cancelAnimationFrame(raf); raf = requestAnimationFrame(() => applyBgByIndex(nearestIndex())); }, { passive: true });
    let isScrolling = false; let wheelTimer = null;
    snap.addEventListener("wheel", (e) => {
      if (qs(".modal.open")) return;
      if (isScrolling) { e.preventDefault(); return; }
      const dy = e.deltaY; if (Math.abs(dy) < 15) return;
      isScrolling = true; e.preventDefault();
      const idx = nearestIndex(); const next = dy > 0 ? idx + 1 : idx - 1;
      const target = sections[Math.max(0, Math.min(sections.length - 1, next))];
      if (target) { applyBgByIndex(next); target.scrollIntoView({ behavior: "smooth", block: "start" }); }
      clearTimeout(wheelTimer); wheelTimer = setTimeout(() => { isScrolling = false; }, 1200);
    }, { passive: false });
  }

  async function renderPhotoGallery() {
    const host = qs("#gallery-modal"); if (!host) return;
    host.innerHTML = '<p class="muted">正在加载照片...</p>';
    try {
      const res = await fetch("data/photos.json"); if (!res.ok) throw new Error("加载失败");
      const items = await res.json();
      if (!items.length) { host.innerHTML = '<p class="muted">暂无照片</p>'; return; }
      // ✅ 关键修复：列表里使用 thumb (缩略图) 加载
      host.innerHTML = items.map((item, idx) => `
        <div class="photo-card" data-idx="${idx}">
          <img src="${item.thumb || item.src}" loading="lazy" alt="${item.title || ''}" />
        </div>
      `).join("");
      qsa(".photo-card", host).forEach((card) => {
        card.addEventListener("click", () => { const idx = card.dataset.idx; openLightbox(items[idx]); });
      });
    } catch (e) { console.error(e); host.innerHTML = '<p class="muted">加载失败 (请检查 data/photos.json)</p>'; }
  }

  function openLightbox(item) {
    const modal = qs("#modal-photo-view"); if (!modal) return;
    const img = qs("#photo-view-img", modal); const title = qs("#photo-view-title", modal); const date = qs("#photo-view-date", modal); const desc = qs("#photo-view-desc", modal);
    // ✅ 大图浏览：使用 src (高清图)
    if (img) img.src = item.src;
    if (title) title.textContent = item.title || "";
    if (date) date.textContent = item.date || "";
    if (desc) desc.textContent = item.desc || "";
    if (typeof openModal === 'function') openModal(modal);
  }

  function init() {
    setupNoBlueSelectionOnTap(); setupHeroReplayOnEnter();
    seasonFxRef = setupSeasonFx(); setupSeasonSwitcher(seasonFxRef);
    setupModals(); setupCenterWheelScroll(); setupWheelPaging();
    renderPhotoGallery();
  }
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", init); } else { init(); }
})();
  // =========================
  // 9. 启动入口
  // =========================
  function init() {
    setupNoBlueSelectionOnTap();
    setupHeroReplayOnEnter();

    seasonFxRef = setupSeasonFx();
    setupSeasonSwitcher(seasonFxRef);
    
    setupModals();
    setupCenterWheelScroll();
    setupWheelPaging();
    
    renderPhotoGallery(); 
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();