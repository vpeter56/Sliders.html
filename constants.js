// ── Colour palette ────────────────────────────────────────────────────────────
export const PALETTE = [
  "#FF6B2B","#FFB347","#4ECDC4","#A8E6CF","#FF8B94","#C9B1FF",
  "#85C1E9","#F8D56B","#B5EAD7","#FF9AA2","#F06292","#81C784",
  "#64B5F6","#FFD54F","#A1887F","#90A4AE",
];

// ── Snap step options ─────────────────────────────────────────────────────────
export const STEPS = [
  { l: "5m",  m: 5  },
  { l: "10m", m: 10 },
  { l: "15m", m: 15 },
  { l: "30m", m: 30 },
];

// ── Theme tokens ──────────────────────────────────────────────────────────────
export const DARK = {
  bg:         "#1c1c1e",
  bgCard:     "#2a2a2e",
  bgInput:    "#323236",
  bgSlider:   "#484850",
  border:     "#505058",
  borderMid:  "#626268",
  text:       "#ffffff",
  textSub:    "#e8e8e8",
  textMuted:  "#c0c0c0",
  textDim:    "#a0a0a0",
  textFaint:  "#888890",
  donutFree:  "#3a3a3e",
  tc:         "#1c1c1e",
};

export const LIGHT = {
  bg:         "#f4f3ef",
  bgCard:     "#eceae4",
  bgInput:    "#e4e2db",
  bgSlider:   "#d8d6cf",
  border:     "#cac8c1",
  borderMid:  "#bbb9b2",
  text:       "#1a1a1a",
  textSub:    "#2e2e2e",
  textMuted:  "#555",
  textDim:    "#777",
  textFaint:  "#999",
  donutFree:  "#d8d6cf",
  tc:         "#f4f3ef",
};

// ── Default task list ─────────────────────────────────────────────────────────
export const DEFAULT_TASKS = [
  { id: 1, name: "Sleep",    hours: 8, originalHours: 8, color: PALETTE[0], locked: false, actual: 0 },
  { id: 2, name: "Work",     hours: 6, originalHours: 6, color: PALETTE[1], locked: false, actual: 0 },
  { id: 3, name: "Exercise", hours: 1, originalHours: 1, color: PALETTE[2], locked: false, actual: 0 },
];

// ── localStorage key ──────────────────────────────────────────────────────────
export const STORAGE_KEY = "sliders_data";

// ── Timing constants ──────────────────────────────────────────────────────────
export const LONG_PRESS_DELAY_MS  = 400;
export const TOAST_DURATION_MS    = 2500;
export const CONFIRM_TIMEOUT_MS   = 3000;
export const LERP_SPEED           = 0.3;
export const DONUT_LERP_SPEED     = 0.22;
export const FLOAT_TOLERANCE      = 0.001;
export const ANGLE_TOLERANCE      = 0.0008;
export const SLIDER_TOLERANCE     = 0.0005;
