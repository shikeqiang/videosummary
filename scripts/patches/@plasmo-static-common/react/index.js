// ============================================================================
// @plasmo-static-common/react — STUB
// 
// Why this exists: Plasmo 0.86.3's auto-generated scaffold imports
// `getLayout` from "@plasmo-static-common/react" — but this package is NOT
// published to npm and NOT installed by `npm install plasmo`. The scaffold
// code is dead-in-the-water without it.
//
// Real getLayout wraps the component with Plasmo's runtime context
// (theme, i18n, error boundaries). For our purposes, we don't need any of
// that — pass-through is fine.
//
// To replace with the real package when network is OK:
//   rm -rf extension/node_modules/@plasmo-static-common
//   # then ensure plasmo version >= 0.87 which fixed this
// ============================================================================

export function getLayout(Component) {
  // Pass-through: just return the component as the "Layout"
  return Component
}

export function getMountPoint() {
  return "__plasmo"
}

export const PlasmoCSUI = ({ children }) => children

// === PATCHED-BY-scripts-patch-node-modules.sh ===
