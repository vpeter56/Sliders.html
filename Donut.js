const { useState, useRef, useEffect, useCallback, useReducer } = React;

// ── Donut ─────────────────────────────────────────────────────────────────────
// Pie/donut chart of task allocations. Supports drag-to-reorder segments via
// a long-press. Segment angles animate smoothly with a lerp loop.

const DONUT_SIZE  = 220;
const DONUT_R     = 72;
const DONUT_CX    = 110;
const DONUT_CY    = 110;
const DONUT_INNER = 45;

const LONG_PRESS_MS  = 400;
const LERP_SPEED     = 0.22;
const ANGLE_TOL      = 0.0008;

function buildSegmentPath(cx, cy, r, startAngle, sweep) {
  const x1 = cx + r * Math.cos(startAngle),       y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(startAngle + sweep), y2 = cy + r * Math.sin(startAngle + sweep);
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`;
}

export function Donut({ tasks, T, dayLen, onReorder }) {
  const total     = tasks.reduce((s, t) => s + t.hours, 0);
  const unalloc   = Math.max(0, dayLen - total);
  const allSlices = [...tasks, ...(unalloc > 0.001 ? [{ id: "free", hours: unalloc, color: T.donutFree }] : [])];

  // Global brightness: short days fade the whole donut
  const globalBrightness = Math.max(0.18, Math.min(1, dayLen / 4));
  const getSegmentBrightness = hours => {
    if (dayLen <= 0) return 0.35;
    const share = hours / dayLen;
    return Math.max(0.35, Math.min(1, 0.35 + 0.65 * share * allSlices.length));
  };

  const [dragSeg, setDragSeg] = useState(null);
  const [overSeg, setOverSeg] = useState(null);
  const longPressRef = useRef(null);
  const svgRef       = useRef();
  const wrapRef      = useRef();

  // ── Smooth angle animation ─────────────────────────────────────────────────
  const animAngles   = useRef({});   // current animated state  {id: {startA, sw}}
  const targetAngles = useRef({});   // target state
  const animRaf      = useRef(null);
  const [, forceRender] = useReducer(x => x + 1, 0);

  const computeTargets = useCallback(() => {
    const targets = {};
    let angle = -Math.PI / 2;
    for (const slice of allSlices) {
      const sweep = (slice.hours / dayLen) * 2 * Math.PI;
      targets[slice.id] = { startA: angle, sw: Math.max(0, sweep) };
      angle += sweep;
    }
    return targets;
  }, [allSlices, dayLen]);

  const lerpAngle = (a, b, t) => a + (b - a) * t;

  const startAnimation = useCallback(() => {
    if (animRaf.current) return;
    const run = () => {
      const target  = targetAngles.current;
      const current = animAngles.current;
      let needMore = false;
      const next = {};
      for (const id of Object.keys(target)) {
        const t = target[id];
        const c = current[id] || { startA: t.startA, sw: t.sw };
        const dA  = t.startA - c.startA;
        const dSw = t.sw     - c.sw;
        if (Math.abs(dA) < ANGLE_TOL && Math.abs(dSw) < ANGLE_TOL) {
          next[id] = { startA: t.startA, sw: t.sw };
        } else {
          next[id] = { startA: lerpAngle(c.startA, t.startA, LERP_SPEED), sw: lerpAngle(c.sw, t.sw, LERP_SPEED) };
          needMore = true;
        }
      }
      animAngles.current = next;
      forceRender();
      animRaf.current = needMore ? requestAnimationFrame(run) : null;
    };
    animRaf.current = requestAnimationFrame(run);
  }, []);

  useEffect(() => {
    const targets = computeTargets();
    targetAngles.current = targets;
    // Seed new segments immediately so they don't animate in from zero
    for (const id of Object.keys(targets)) {
      if (!animAngles.current[id]) animAngles.current[id] = { ...targets[id] };
    }
    startAnimation();
  }, [tasks, dayLen]);

  useEffect(() => () => { if (animRaf.current) cancelAnimationFrame(animRaf.current); }, []);

  // Build segs from animated angles
  const segs = allSlices.map(slice => {
    const aState = animAngles.current[slice.id] || targetAngles.current[slice.id];
    if (!aState || aState.sw < 0.002) return null;
    return { slice, startA: aState.startA, sw: aState.sw, endA: aState.startA + aState.sw };
  });

  // ── Hit-testing ────────────────────────────────────────────────────────────
  const getSegIndexFromEvent = e => {
    const rect = (wrapRef.current || svgRef.current).getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = (clientX - rect.left) / rect.width  * DONUT_SIZE - DONUT_CX;
    const y = (clientY - rect.top)  / rect.height * DONUT_SIZE - DONUT_CY;
    const dist = Math.sqrt(x * x + y * y);
    if (dist < DONUT_INNER || dist > DONUT_R + 12) return null;
    const angle = Math.atan2(y, x);
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      if (!seg || seg.slice.id === "free") continue;
      const normA  = ((angle - seg.startA) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      const normSw = ((seg.endA - seg.startA) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      if (normA <= normSw) return i;
    }
    return null;
  };

  // ── Pointer handlers ───────────────────────────────────────────────────────
  const onPointerDown = i => e => {
    if (allSlices[i].id === "free") return;
    e.preventDefault();
    wrapRef.current?.setPointerCapture(e.pointerId);
    longPressRef.current = setTimeout(() => {
      try { if (navigator.vibrate) navigator.vibrate([10, 30, 10]); } catch {}
      setDragSeg(i);
    }, LONG_PRESS_MS);
  };

  const onPointerMove = e => {
    if (dragSeg === null) return;
    e.preventDefault();
    const idx = getSegIndexFromEvent(e);
    setOverSeg(idx !== null && allSlices[idx]?.id !== "free" && idx !== dragSeg ? idx : null);
  };

  const onPointerUp = () => {
    clearTimeout(longPressRef.current);
    if (dragSeg !== null && overSeg !== null && overSeg !== dragSeg) {
      onReorder(dragSeg, overSeg);
    }
    setDragSeg(null);
    setOverSeg(null);
  };

  const onPointerCancel = () => {
    clearTimeout(longPressRef.current);
    setDragSeg(null);
    setOverSeg(null);
  };

  return (
    <div ref={wrapRef}
      style={{ position: "absolute", top: 0, left: 0, width: DONUT_SIZE, height: DONUT_SIZE, pointerEvents: dragSeg !== null ? "auto" : "none" }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <svg ref={svgRef} width={DONUT_SIZE} height={DONUT_SIZE}
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", touchAction: "none", cursor: dragSeg !== null ? "grabbing" : "default" }}
      >
        {segs.map((seg, i) => {
          if (!seg) return null;
          const { slice } = seg;
          const isFree       = slice.id === "free";
          const isDragging   = dragSeg === i;
          const isOver       = overSeg === i;
          const scale        = isDragging ? 1.08 : isOver ? 0.94 : 1;
          const segBrightness = isFree ? globalBrightness : globalBrightness * getSegmentBrightness(slice.hours);
          const baseOpacity  = slice.done ? 0.4 : 1;

          return (
            <g key={slice.id || i}
              style={{
                transformOrigin: `${DONUT_CX}px ${DONUT_CY}px`,
                transform:  `scale(${scale})`,
                transition: dragSeg !== null ? "transform 0.15s ease" : "transform 0.25s ease",
                cursor:     isFree ? "default" : dragSeg !== null ? "grabbing" : "grab",
                opacity:    isDragging ? 1 : baseOpacity * segBrightness,
              }}
              pointerEvents={isFree ? "none" : "auto"}
              onPointerDown={isFree ? undefined : onPointerDown(i)}
            >
              <path
                d={buildSegmentPath(DONUT_CX, DONUT_CY, DONUT_R, seg.startA, seg.sw)}
                fill={isOver ? "#888" : (slice.done ? "#444" : slice.color)}
                stroke={isDragging ? slice.color : T.bg}
                strokeWidth={isDragging ? 2.5 : 1.5}
                style={{
                  filter:     isDragging ? `drop-shadow(0 0 6px ${slice.color}88)` : "none",
                  transition: "fill 0.3s,opacity 0.3s,filter 0.15s",
                }}
              />
            </g>
          );
        })}

        {/* Centre hole + labels */}
        <circle cx={DONUT_CX} cy={DONUT_CY} r={DONUT_INNER} fill={T.bg} style={{ pointerEvents: "none" }} />
        <text x={DONUT_CX} y={DONUT_CY - 7} textAnchor="middle" fill={T.text} fontSize={12}
          fontFamily="'Space Mono',monospace" fontWeight="bold" style={{ pointerEvents: "none" }}>
          {window.formatHours(total)}
        </text>
        <text x={DONUT_CX} y={DONUT_CY + 9} textAnchor="middle"
          fill={dragSeg !== null ? "#FF6B2B" : T.textMuted} fontSize={8}
          fontFamily="'Space Mono',monospace" style={{ pointerEvents: "none", transition: "fill 0.2s" }}>
          {dragSeg !== null ? "swap ↕" : "left"}
        </text>
      </svg>
    </div>
  );
}
