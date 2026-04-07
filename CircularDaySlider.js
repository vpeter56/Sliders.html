const { useRef } = React;

// ── CircularDaySlider ─────────────────────────────────────────────────────────
// Ring slider rendered as an SVG. Two drag handles control dayStart (teal)
// and dayEnd (orange). Hours 0-24 map to 0-360°, starting from the top (−90°).

const SIZE     = 220;  // SVG canvas size
const CX       = 110;
const CY       = 110;
const R_TRACK  = 88;   // radius of the ring track
const R_THUMB  = 9;    // radius of drag handles
const STROKE   = 10;   // track stroke width

const START_COLOR = "#4ECDC4";
const END_COLOR   = "#FF6B2B";
const ARC_COLOR   = "#FF6B2B";

/** Convert hour (0–24) to angle in radians; 0h = top = −π/2 */
const hourToAngle = h => (h / 24) * 2 * Math.PI - Math.PI / 2;

/** Convert angle (rad) to hour (0–24), snapped to 0.5h */
const angleToHour = a => {
  const deg = ((a + Math.PI / 2) / (2 * Math.PI) * 24 + 24) % 24;
  return Math.round(deg * 2) / 2;
};

/** SVG arc path going clockwise from angle a1 to a2 */
function arcPath(a1, a2) {
  let span = ((a2 - a1) + 2 * Math.PI) % (2 * Math.PI);
  if (span === 0) span = 2 * Math.PI;
  const large = span > Math.PI ? 1 : 0;
  const x1 = CX + R_TRACK * Math.cos(a1), y1 = CY + R_TRACK * Math.sin(a1);
  const x2 = CX + R_TRACK * Math.cos(a2), y2 = CY + R_TRACK * Math.sin(a2);
  return `M ${x1} ${y1} A ${R_TRACK} ${R_TRACK} 0 ${large} 1 ${x2} ${y2}`;
}

const FULL_CIRCLE = `M ${CX} ${CY - R_TRACK} A ${R_TRACK} ${R_TRACK} 0 1 1 ${CX - 0.001} ${CY - R_TRACK}`;

function TimeLabel({ hour, angleRad, color, cx, cy }) {
  const labelR = R_TRACK + 22;
  const lx = cx + labelR * Math.cos(angleRad);
  const ly = cy + labelR * Math.sin(angleRad);
  const anchor = lx < cx - 10 ? "end" : lx > cx + 10 ? "start" : "middle";
  const label = `${String(Math.floor(hour)).padStart(2, "0")}:${hour % 1 ? "30" : "00"}`;
  return (
    <text x={lx} y={ly + 4} textAnchor={anchor} fill={color} fontSize={9}
      fontFamily="'Space Mono',monospace" fontWeight="bold"
      style={{ pointerEvents: "none" }}>
      {label}
    </text>
  );
}

export function CircularDaySlider({ dayStart, dayEnd, T, onChange }) {
  const svgRef   = useRef();
  const dragging = useRef(null); // 'start' | 'end' | null

  const aStart = hourToAngle(dayStart);
  const aEnd   = hourToAngle(dayEnd);
  const dayLen  = dayEnd - dayStart;

  const thumbPos = a => ({ x: CX + R_TRACK * Math.cos(a), y: CY + R_TRACK * Math.sin(a) });
  const tStart = thumbPos(aStart);
  const tEnd   = thumbPos(aEnd);

  const getAngleFromEvent = e => {
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = (clientX - rect.left) / rect.width  * SIZE - CX;
    const y = (clientY - rect.top)  / rect.height * SIZE - CY;
    return Math.atan2(y, x);
  };

  const onPointerDown = which => e => {
    e.preventDefault();
    e.stopPropagation();
    dragging.current = which;
    svgRef.current.setPointerCapture(e.pointerId);
  };

  const onPointerMove = e => {
    if (!dragging.current) return;
    const h = angleToHour(getAngleFromEvent(e));
    if (dragging.current === "start") {
      onChange(Math.max(0, Math.min(h, dayEnd - 0.5)), dayEnd);
    } else {
      onChange(dayStart, Math.max(dayStart + 0.5, Math.min(h, 24)));
    }
  };

  const onPointerUp = () => { dragging.current = null; };

  const arcOpacity = 0.2 + 0.8 * Math.max(0, Math.min(1, dayLen / 24));
  const centerTimeRange = `${String(Math.floor(dayStart)).padStart(2,"0")}:${dayStart%1?"30":"00"}–${String(Math.floor(dayEnd)).padStart(2,"0")}:${dayEnd%1?"30":"00"}`;

  return (
    <div style={{ position: "relative", width: SIZE, height: SIZE, flexShrink: 0 }}>
      <svg ref={svgRef} width={SIZE} height={SIZE}
        style={{ display: "block", touchAction: "none", userSelect: "none", overflow: "visible" }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {/* Background ring */}
        <path d={FULL_CIRCLE} fill="none" stroke={T.bgSlider} strokeWidth={STROKE} strokeLinecap="round" />

        {/* Active arc */}
        <path d={arcPath(aStart, aEnd)} fill="none" stroke={ARC_COLOR} strokeWidth={STROKE}
          strokeLinecap="round" opacity={arcOpacity} style={{ transition: "opacity 0.3s" }} />

        {/* Center labels */}
        <text x={CX} y={CY - 8} textAnchor="middle" fill={T.text} fontSize={13}
          fontFamily="'Space Mono',monospace" fontWeight="bold">
          {/* formatHours injected at runtime via window */}
          {window.formatHours(dayLen)}
        </text>
        <text x={CX} y={CY + 8} textAnchor="middle" fill={T.textMuted} fontSize={9}
          fontFamily="'Space Mono',monospace">
          {centerTimeRange}
        </text>

        {/* Start handle (teal) */}
        <circle cx={tStart.x} cy={tStart.y} r={R_THUMB + 4} fill="transparent"
          style={{ cursor: "grab" }} onPointerDown={onPointerDown("start")} />
        <circle cx={tStart.x} cy={tStart.y} r={R_THUMB} fill={START_COLOR} stroke={T.bg} strokeWidth={2}
          style={{ cursor: "grab", filter: `drop-shadow(0 0 4px ${START_COLOR}88)` }}
          onPointerDown={onPointerDown("start")} />
        <TimeLabel hour={dayStart} angleRad={aStart} color={START_COLOR} cx={CX} cy={CY} />

        {/* End handle (orange) */}
        <circle cx={tEnd.x} cy={tEnd.y} r={R_THUMB + 4} fill="transparent"
          style={{ cursor: "grab" }} onPointerDown={onPointerDown("end")} />
        <circle cx={tEnd.x} cy={tEnd.y} r={R_THUMB} fill={END_COLOR} stroke={T.bg} strokeWidth={2}
          style={{ cursor: "grab", filter: `drop-shadow(0 0 4px ${END_COLOR}88)` }}
          onPointerDown={onPointerDown("end")} />
        <TimeLabel hour={dayEnd} angleRad={aEnd} color={END_COLOR} cx={CX} cy={CY} />
      </svg>
    </div>
  );
}
