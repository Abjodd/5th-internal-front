// The app runs at `html { zoom: 1.1 }`. getBoundingClientRect() returns
// VISUAL pixels (zoom already applied), while a `position:fixed` element's
// own left/top/width are LAYOUT pixels that the browser multiplies by zoom
// AGAIN on paint. Any popover anchored to a trigger's rect — a dropdown, a
// date picker, a hover card — drifts and over-sizes unless the measurement is
// divided back out first. First found and fixed for the pipeline hover card
// (Campaigns/index.jsx); pulled out here once a second component
// (BrandPicker) needed the same fix, so the next one can import it instead of
// re-deriving it.
export const zoomOf = (el) => {
  let z = 1;
  for (let n = el; n; n = n.parentElement) z *= parseFloat(getComputedStyle(n).zoom) || 1;
  return z;
};
