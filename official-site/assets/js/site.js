(function () {
  "use strict";

  var button = document.querySelector("[data-menu-button]");
  var nav = document.querySelector("[data-nav]");

  if (!button || !nav) return;

  function closeMenu() {
    button.setAttribute("aria-expanded", "false");
    nav.classList.remove("open");
    document.body.classList.remove("menu-open");
  }

  button.addEventListener("click", function () {
    var isOpen = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!isOpen));
    nav.classList.toggle("open", !isOpen);
    document.body.classList.toggle("menu-open", !isOpen);
  });

  nav.addEventListener("click", function (event) {
    if (event.target.closest("a")) closeMenu();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeMenu();
  });

  window.addEventListener("resize", function () {
    if (window.innerWidth > 760) closeMenu();
  });
})();
