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
export const A_PLUM = "#8B5CF6";
export const A_TEAL = "#39B6D8";

export const T_SAGE = "#3d6838";
export const T_CORAL = "#c04a20";
export const T_SKY = "#0c4a6e";
export const T_ORANGE = "#9a3412";
export const T_PLUM = "#6b5280";
export const T_CYAN = "#164e63";

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
export const P_PLUM: ColorPalette = {
  bg: [SURFACE_ZERO, "rgba(245,240,255,0.35)", "rgba(245,240,255,0.55)", "rgba(201,180,245,0.45)", "rgba(167,139,250,0.35)"],
  text: [MUTED_TEXT, T_PLUM, T_PLUM, T_PLUM, T_PLUM],
};
export const P_TEAL: ColorPalette = {
  bg: [SURFACE_ZERO, "rgba(236,254,255,0.35)", "rgba(236,254,255,0.55)", "rgba(165,243,252,0.5)", "rgba(103,232,249,0.4)"],
  text: [MUTED_TEXT, T_CYAN, T_CYAN, T_CYAN, T_CYAN],
};

/* Dark mode — tinted overlays on dark surface, light text at all intensity levels */
const D_MUTED = "#7A756C";

export const D_NEUTRAL: ColorPalette = {
  bg: [SURFACE_ZERO, "rgba(168,163,152,0.10)", "rgba(168,163,152,0.18)", "rgba(168,163,152,0.28)", "rgba(168,163,152,0.38)"],
  text: [D_MUTED, "#C8C4BC", "#DDD9D1", "#F0EDE8", "#FAFAF8"],
};
export const D_SKY: ColorPalette = {
  bg: [SURFACE_ZERO, "rgba(56,189,248,0.10)", "rgba(56,189,248,0.18)", "rgba(56,189,248,0.28)", "rgba(56,189,248,0.38)"],
  text: [D_MUTED, "#7DD3FC", "#BAE6FD", "#E0F2FE", "#F0F9FF"],
};
export const D_ON_HOLD: ColorPalette = {
  bg: [SURFACE_ZERO, "rgba(227,131,48,0.10)", "rgba(227,131,48,0.18)", "rgba(227,131,48,0.28)", "rgba(227,131,48,0.38)"],
  text: [D_MUTED, "#FDBA74", "#FED7AA", "#FFEDD5", "#FFF7ED"],
};
export const D_SAGE: ColorPalette = {
  bg: [SURFACE_ZERO, "rgba(106,158,98,0.10)", "rgba(106,158,98,0.18)", "rgba(106,158,98,0.28)", "rgba(106,158,98,0.38)"],
  text: [D_MUTED, "#86EFAC", "#BBF7D0", "#DCFCE7", "#F0FDF4"],
};
export const D_CORAL: ColorPalette = {
  bg: [SURFACE_ZERO, "rgba(240,112,64,0.10)", "rgba(240,112,64,0.18)", "rgba(240,112,64,0.28)", "rgba(240,112,64,0.38)"],
  text: [D_MUTED, "#FDA4AF", "#FECDD3", "#FFE4E6", "#FFF1F2"],
};
export const D_ORANGE: ColorPalette = {
  bg: [SURFACE_ZERO, "rgba(227,131,48,0.10)", "rgba(227,131,48,0.18)", "rgba(227,131,48,0.28)", "rgba(227,131,48,0.38)"],
  text: [D_MUTED, "#FDBA74", "#FED7AA", "#FFEDD5", "#FFF7ED"],
};
export const D_PLUM: ColorPalette = {
  bg: [SURFACE_ZERO, "rgba(139,92,246,0.10)", "rgba(139,92,246,0.18)", "rgba(139,92,246,0.28)", "rgba(139,92,246,0.38)"],
  text: [D_MUTED, "#C4B5FD", "#DDD6FE", "#EDE9FE", "#F5F3FF"],
};
export const D_TEAL: ColorPalette = {
  bg: [SURFACE_ZERO, "rgba(57,182,216,0.10)", "rgba(57,182,216,0.18)", "rgba(57,182,216,0.28)", "rgba(57,182,216,0.38)"],
  text: [D_MUTED, "#67E8F9", "#A5F3FC", "#CFFAFE", "#ECFEFF"],
};

const LIGHT_TO_DARK = new Map<ColorPalette, ColorPalette>([
  [P_NEUTRAL, D_NEUTRAL],
  [P_SKY, D_SKY],
  [P_ON_HOLD, D_ON_HOLD],
  [P_SAGE, D_SAGE],
  [P_CORAL, D_CORAL],
  [P_ORANGE, D_ORANGE],
  [P_PLUM, D_PLUM],
  [P_TEAL, D_TEAL],
]);

export function resolvePalette(palette: ColorPalette, isDark: boolean): ColorPalette {
  if (!isDark) return palette;
  return LIGHT_TO_DARK.get(palette) ?? palette;
}

export const LEGEND_LEVELS = ["#fafaf8", "#f0f9ff", "#e0f2fe", "rgba(186,230,253,0.7)", "rgba(125,211,252,0.6)"] as const;
export const LEGEND_LEVELS_DARK = ["#2A2822", "rgba(56,189,248,0.15)", "rgba(56,189,248,0.28)", "rgba(56,189,248,0.42)", "rgba(56,189,248,0.55)"] as const;

export function sectionHeaderBg(accent: string, lightBg: string, isDark: boolean): string {
  if (!isDark) return lightBg;
  return `color-mix(in srgb, ${accent} 14%, var(--lx-surface))`;
}

export function sectionSubheaderBg(accent: string, lightBg: string, isDark: boolean): string {
  if (!isDark) return lightBg;
  return `color-mix(in srgb, ${accent} 8%, var(--lx-surface))`;
}

export function intensityLevel(value: number, colMax: number): 0 | 1 | 2 | 3 | 4 {
  if (value === 0 || colMax === 0) return 0;
  const r = value / colMax;
  if (r <= 0.25) return 1;
  if (r <= 0.50) return 2;
  if (r <= 0.75) return 3;
  return 4;
}

export function cellStyle(value: number, colMax: number, palette: ColorPalette, isDark = false) {
  const p = resolvePalette(palette, isDark);
  const lvl = intensityLevel(value, colMax);
  return { background: p.bg[lvl], color: p.text[lvl] };
}
