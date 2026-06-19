/** Lumina v1.0 design tokens — single source for JS/TS consumers. CSS vars in index.css. */

export const LX = {
  orange:  "#E38330",
  yellow:  "#F7D344",
  success: "#6A9E62",
  risk:    "#F07040",
  info:    "#4A8EE8",
  ai:      "#8B5CF6",
  teal:    "#39B6D8",
  bg:      "#FAFAF8",
  surface: "#FFFFFF",
  soft:    "#F4F3EF",
  border:  "#E8E5DC",
  text:    "#1A1916",
  text2:   "#5C594F",
  text3:   "#7A756C",
} as const;

export const LX_DARK = {
  bg:      "#1A1916",
  surface: "#2A2822",
  soft:    "#3D3B35",
  border:  "#5C594F",
  text:    "#FAFAF8",
  text2:   "#A8A398",
  text3:   "#7A756C",
} as const;

export const LX_MOTION = {
  instant: "80ms",
  fast:    "150ms",
  normal:  "220ms",
  slow:    "350ms",
  page:    "450ms",
} as const;

export const LX_RADIUS = {
  xs:   "4px",
  sm:   "6px",
  md:   "10px",
  lg:   "16px",
  xl:   "24px",
  pill: "9999px",
} as const;
