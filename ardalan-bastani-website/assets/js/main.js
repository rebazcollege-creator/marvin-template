/* ============================================================
   Interactions: preloader · cursor · splits · reveals ·
   magnetic · marquee · language switch · mobile nav
   ============================================================ */
(function () {
  "use strict";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- split text into animated letters ---- */
  function split(el) {
    var html = el.innerHTML;
    el.innerHTML = "";
    var parts = html.split(/(<br\s*\/?>)/i);
    parts.forEach(function (p) {
      if (/<br/i.test(p)) { el.appendChild(document.createElement("br")); return; }
      p.split("").forEach(function (c) {
        var s = document.createElement("span");
        s.className = "ch";
        s.textContent = c === " " ? " " : c;
        el.appendChild(s);
      });
    });
    return el.querySelectorAll(".ch");
  }
  function playChars(chars, delay) {
    chars.forEach(function (c, i) {
      setTimeout(function () { c.classList.add("in"); }, delay + i * 38);
    });
  }

  /* ---- preloader ---- */
  var pl = document.getElementById("preloader");
  var bar = pl ? pl.querySelector(".preloader__bar i") : null;
  var count = document.getElementById("plCount");
  function startSite() {
    document.body.classList.remove("locked");
    // hero name + footer name
    var hn = document.querySelector(".hero__name[data-split]");
    if (hn) playChars(split(hn), 200);
    var fb = document.querySelector(".ft__big[data-split]");
    if (fb) split(fb); // animated on scroll via observer
    revealInit();
  }
  if (pl && !reduce) {
    document.body.classList.add("locked");
    var started = false;
    function finish() {
      if (started) return; started = true;
      if (bar) bar.style.width = "100%";
      if (count) count.textContent = "100";
      setTimeout(function () { pl.classList.add("done"); }, 250);
      setTimeout(startSite, 650);
    }
    var t0 = null, DUR = 1600; // ms, time-based so it never stalls
    (function tick(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min(100, ((ts - t0) / DUR) * 100);
      if (bar) bar.style.width = p + "%";
      if (count) count.textContent = ("0" + Math.floor(p)).slice(-2);
      if (p < 100) requestAnimationFrame(tick); else finish();
    })(performance.now());
    setTimeout(finish, DUR + 1200); // hard safety net
  } else {
    if (pl) pl.style.display = "none";
    startSite();
  }

  /* ---- custom cursor ---- */
  var cur = document.getElementById("cursor");
  if (cur && window.matchMedia("(hover:hover)").matches) {
    var cx = innerWidth / 2, cy = innerHeight / 2, tx = cx, ty = cy;
    addEventListener("mousemove", function (e) { tx = e.clientX; ty = e.clientY; });
    (function loop() {
      cx += (tx - cx) * .18; cy += (ty - cy) * .18;
      cur.style.transform = "translate(" + cx + "px," + cy + "px) translate(-50%,-50%)";
      requestAnimationFrame(loop);
    })();
    var hov = "a,button,.tilt,.gal__i,[data-edit]";
    document.querySelectorAll(hov).forEach(function (el) {
      el.addEventListener("mouseenter", function () { cur.classList.add("is-hover"); });
      el.addEventListener("mouseleave", function () { cur.classList.remove("is-hover"); });
    });
  }

  /* ---- scroll reveals ---- */
  function revealInit() {
    if (reduce) {
      document.querySelectorAll(".reveal,.reveal-lines,.sec__title").forEach(function (e) { e.classList.add("in"); });
      return;
    }
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        el.classList.add("in");
        if (el.classList.contains("ft__big")) playChars(el.querySelectorAll(".ch"), 0);
        io.unobserve(el);
      });
    }, { threshold: .18, rootMargin: "0px 0px -8% 0px" });
    document.querySelectorAll(".reveal,.sec__title,.ft__big").forEach(function (e) { io.observe(e); });
  }

  /* ---- magnetic buttons ---- */
  if (window.matchMedia("(hover:hover)").matches) {
    document.querySelectorAll(".magnetic").forEach(function (el) {
      el.addEventListener("mousemove", function (e) {
        var r = el.getBoundingClientRect();
        var mx = e.clientX - r.left - r.width / 2;
        var my = e.clientY - r.top - r.height / 2;
        el.style.transform = "translate(" + mx * .25 + "px," + my * .35 + "px)";
      });
      el.addEventListener("mouseleave", function () { el.style.transform = ""; });
    });
  }

  /* ---- card / gallery tilt ---- */
  if (window.matchMedia("(hover:hover)").matches && !reduce) {
    document.querySelectorAll(".tilt").forEach(function (el) {
      el.addEventListener("mousemove", function (e) {
        var r = el.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - .5;
        var py = (e.clientY - r.top) / r.height - .5;
        el.style.transform = "perspective(800px) rotateX(" + (-py * 5) + "deg) rotateY(" + (px * 6) + "deg)";
      });
      el.addEventListener("mouseleave", function () { el.style.transform = ""; });
    });
  }

  /* ---- marquee loop ---- */
  var mq = document.getElementById("marquee");
  if (mq && !reduce) {
    mq.innerHTML += mq.innerHTML;
    var off = 0;
    (function run() {
      off -= .5;
      if (Math.abs(off) >= mq.scrollWidth / 2) off = 0;
      mq.style.transform = "translateX(" + off + "px)";
      requestAnimationFrame(run);
    })();
  }

  /* ---- mobile nav ---- */
  var burger = document.getElementById("burger");
  var nav = document.querySelector(".hd__nav");
  if (burger && nav) {
    burger.addEventListener("click", function () { nav.classList.toggle("open"); });
    nav.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () { nav.classList.remove("open"); });
    });
  }

  /* ---- language switch ---- */
  var dict = window.I18N || {};
  function applyLang(lang) {
    var s = dict[lang]; if (!s) return;
    var rtl = lang === "ku";
    document.documentElement.setAttribute("lang", rtl ? "ckb" : lang);
    document.documentElement.setAttribute("dir", rtl ? "rtl" : "ltr");
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var k = el.getAttribute("data-i18n");
      if (s[k] != null) el.innerHTML = s[k];
    });
    document.querySelectorAll(".hd__lang button").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-lang") === lang);
    });
    try { localStorage.setItem("ab_lang", lang); } catch (e) {}
  }
  document.querySelectorAll(".hd__lang button").forEach(function (b) {
    b.addEventListener("click", function () {
      applyLang(b.getAttribute("data-lang"));
      if (nav) nav.classList.remove("open");
    });
  });
  var saved = "en";
  try { saved = localStorage.getItem("ab_lang") || "en"; } catch (e) {}
  applyLang(saved);

  var y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();
})();
