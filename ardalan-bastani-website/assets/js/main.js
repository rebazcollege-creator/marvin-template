/* ============================================================
   Language switching, mobile nav, year stamp
   ============================================================ */
(function () {
  "use strict";

  var dict = window.I18N || {};
  var htmlEl = document.documentElement;

  function applyLang(lang) {
    var strings = dict[lang];
    if (!strings) return;

    // Document direction / lang
    var rtl = (lang === "ku");
    htmlEl.setAttribute("lang", rtl ? "ckb" : lang);
    htmlEl.setAttribute("dir", rtl ? "rtl" : "ltr");

    // Swap every translatable node
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      if (strings[key] != null) el.innerHTML = strings[key];
    });

    // Active state on buttons
    document.querySelectorAll(".lang__btn").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-lang") === lang);
    });

    try { localStorage.setItem("ab_lang", lang); } catch (e) {}
  }

  // Wire up language buttons
  document.querySelectorAll(".lang__btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      applyLang(btn.getAttribute("data-lang"));
      closeNav();
    });
  });

  // Restore saved language (default English)
  var saved = "en";
  try { saved = localStorage.getItem("ab_lang") || "en"; } catch (e) {}
  applyLang(saved);

  // Mobile nav
  var toggle = document.getElementById("navToggle");
  var links = document.querySelector(".nav__links");
  function closeNav() { if (links) links.classList.remove("is-open"); }
  if (toggle && links) {
    toggle.addEventListener("click", function () { links.classList.toggle("is-open"); });
    links.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", closeNav);
    });
  }

  // Year stamp
  var y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();
})();
