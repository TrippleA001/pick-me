/**
 * Entry for the 3D game.
 *
 * The whole board is WebGL, so a device without a context would just show the
 * HUD over a blank canvas. Rather than that, hand over to the 2D game, which is
 * the same rules drawn in the DOM and runs anywhere. The real game is imported
 * only once we know there is something to draw into — which also keeps three.js
 * out of the way for the visitors who cannot use it.
 */

function hasWebgl(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

if (hasWebgl()) {
  void import("./game");
} else {
  const msg = document.getElementById("boot-msg");
  if (msg) msg.textContent = "No WebGL on this device — opening the 2D game…";
  // Give the message a moment to be read before the page changes underfoot.
  window.setTimeout(() => location.replace("./2d.html"), 700);
}
