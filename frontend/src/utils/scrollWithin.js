// frontend/src/utils/scrollWithin.js
//
// Scroll / focus helpers that can never move the browser window.
//
// Element.scrollIntoView() and a bare focus() both scroll EVERY scrollable
// ancestor, including the window. On the Admin Pipeline View the console sits
// below the fold, so every console update dragged the whole page down. These
// helpers only ever touch the nearest scrollable ancestor (the console box
// itself) and never document.body / documentElement.

function nearestScrollableAncestor(el) {
  let node = el ? el.parentElement : null;
  while (node && node !== document.body && node !== document.documentElement) {
    const oy = window.getComputedStyle(node).overflowY;
    if ((oy === "auto" || oy === "scroll" || oy === "overlay") && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

// Keeps the end of a log (e.g. console output) visible inside its own box.
export function scrollToEndWithin(endEl) {
  const box = nearestScrollableAncestor(endEl);
  if (box) box.scrollTop = box.scrollHeight;
}

// Callback ref: focuses an input when it mounts, without scrolling the page.
export function focusWithoutScroll(el) {
  if (el) el.focus({ preventScroll: true });
}
