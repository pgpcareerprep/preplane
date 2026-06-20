/** Shared heatmap palette tokens for Prep POC Heatmap views. */

export type ColorPalette = {
  bg: [string, string, string, string, string];
  text: [string, string, string, string, string];
};

export const MUTED_TEXT = "#A8A398";
export const SURFACE_ZERO = "var(--lx-surface)";
export const CELL_BORDER = "var(--lx-cell-border)";

export const A_NEUTRAL = "#78716c";
export const A_SKY = "#38bdf8";
export const A_SAGE = "#6A9E62";
export const A_CORAL = "#F07040";
export const A_ORANGE = "#E38330";

export const T_SAGE = "#3d6838";
export const T_CORAL = "#c04a20";
export const T_SKY = "#0c4a6e";
export const T_ORANGE = "#9a3412";

export const P_NEUTRAL: ColorPalette = {
  bg: [SURFACE_ZERO, "#fafaf9", "#f5f5f4", "#e7e5e4", "rgba(214, 211, 209, 0.7)"],
  text: [MUTED_TEXT, "#44403c", "#44403c", "#44403c", "#44403c"],
};
export const P_SKY: ColorPalette = {
  bg: [SURFACE_ZERO, "rgba(240,249,255,0.5)", "#f0f9ff", "rgba(224,242,254,0.7)", "rgba(186,230,253,0.6)"],
  text: [MUTED_TEXT, T_SKY, T_SKY, T_SKY, T_SKY],
};
export const P_ON_HOLD: ColorPalette = {
  bg: [SURFACE_ZERO, "rgba(255,247,237,0.35)", "rgba(255,247,237,0.55)", "rgba(254,215,170,0.45)", "rgba(253,186,116,0.35)"],
  text: [MUTED_TEXT, T_ORANGE, T_ORANGE, T_ORANGE, T_ORANGE],
};
export const P_SAGE: ColorPalette = {
  bg: [SURFACE_ZERO, "rgba(242,246,241,0.45)", "#f2f6f1", "rgba(184,209,178,0.55)", "rgba(154,197,148,0.45)"],
  text: [MUTED_TEXT, T_SAGE, T_SAGE, T_SAGE, T_SAGE],
};
export const P_CORAL: ColorPalette = {
  bg: [SURFACE_ZERO, "rgba(255,243,238,0.35)", "rgba(255,243,238,0.55)", "rgba(253,191,163,0.45)", "rgba(253,186,116,0.35)"],
  text: [MUTED_TEXT, T_CORAL, T_CORAL, T_CORAL, T_CORAL],
};
export const P_ORANGE: ColorPalette = {
  bg: [SURFACE_ZERO, "rgba(255,247,237,0.35)", "rgba(255,247,237,0.55)", "rgba(254,215,170,0.45)", "rgba(253,186,116,0.35)"],
  text: [MUTED_TEXT, T_ORANGE, T_ORANGE, T_ORANGE, T_ORANGE],
};

export const LEGEND_LEVELS = ["#fafaf8", "#f0f9ff", "#e0f2fe", "rgba(186,230,253,0.7)", "rgba(125,211,252,0.6)"] as const;

export function intensityLevel(value: number, colMax: number): 0 | 1 | 2 | 3 | 4 {
  if (value === 0 || colMax === 0) return 0;
  const r = value / colMax;
  if (r <= 0.25) return 1;
  if (r <= 0.50) return 2;
  if (r <= 0.75) return 3;
  return 4;
}

export function cellStyle(value: number, colMax: number, palette: ColorPalette) {
  const lvl = intensityLevel(value, colMax);
  return { background: palette.bg[lvl], color: palette.text[lvl] };
}
