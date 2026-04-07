const { useState, useRef, useEffect, useCallback } = React;

// ── Slider ────────────────────────────────────────────────────────────────────
// Linear drag slider. Uses direct DOM refs for the fill and thumb so that
// pointer-move updates don't trigger React re-renders (keeps drag buttery smooth).

const SLIDER_TOL = 0.0005;
const LERP_SPEED = 0.3;

export function Slider({ value, max, color, step, locked, onChange }) {
  const trackRef   = useRef();
  const displayRef = useRef();   // fill bar  — direct DOM update
  const thumbRef   = useRef();   // thumb     — direct DOM update
  const isDragging = useRef(false);
  const lastSnapped  = useRef(value);
  const animFrame    = useRef(null);
  const targetRaw    = useRef(value);
  const currentRaw   = useRef(value);

  const applyPercent = pct => {
    const p = Math.max(0, Math.min(100, pct));
    if (displayRef.current) displayRef.current.style.width = p + "%";
    if (thumbRef.current)   thumbRef.current.style.left   = p + "%";
  };

  const animateTo = targetHours => {
    targetRaw.current = targetHours;
    if (animFrame.current) return;
    const run = () => {
      const diff = targetRaw.current - currentRaw.current;
      if (Math.abs(diff) < SLIDER_TOL) {
        currentRaw.current = targetRaw.current;
        applyPercent((currentRaw.current / max) * 100);
        animFrame.current = null;
        return;
      }
      currentRaw.current += diff * LERP_SPEED;
      applyPercent((currentRaw.current / max) * 100);
      animFrame.current = requestAnimationFrame(run);
    };
    animFrame.current = requestAnimationFrame(run);
  };

  // Sync when value changes externally
  useEffect(() => { animateTo(value); }, [value, max]);
  useEffect(() => () => { if (animFrame.current) cancelAnimationFrame(animFrame.current); }, []);

  const getRawHours = useCallback(clientX => {
    const rect = trackRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * max;
  }, [max]);

  const snapHours = useCallback(clientX => {
    const s = parseInt(step) || 15;
    const raw = getRawHours(clientX);
    return Math.round(raw * 60 / s) * s / 60;
  }, [getRawHours, step]);

  const tryHaptic = () => { try { if (navigator.vibrate) navigator.vibrate(4); } catch {} };

  const onPointerDown = e => {
    if (locked) return;
    e.preventDefault();
    isDragging.current = true;
    trackRef.current.setPointerCapture(e.pointerId);
    // Instant jump on touch — no lerp
    const raw = getRawHours(e.clientX);
    currentRaw.current = raw;
    targetRaw.current  = raw;
    applyPercent((raw / max) * 100);
    const snapped = snapHours(e.clientX);
    onChange(snapped);
    lastSnapped.current = snapped;
  };

  const onPointerMove = e => {
    if (!isDragging.current) return;
    const raw     = getRawHours(e.clientX);
    animateTo(raw);
    const snapped = snapHours(e.clientX);
    if (snapped !== lastSnapped.current) { tryHaptic(); lastSnapped.current = snapped; }
    onChange(snapped);
  };

  const onPointerUp = e => {
    if (isDragging.current) {
      isDragging.current = false;
      const snapped = snapHours(e.clientX);
      onChange(snapped);
      animateTo(snapped);
    }
  };

  const initPct = (value / max) * 100;

  return (
    <div ref={trackRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      style={{ position: "relative", height: 36, borderRadius: 8, cursor: locked ? "not-allowed" : "pointer", userSelect: "none", touchAction: locked ? "pan-y" : "none", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: "var(--bg-slider)", borderRadius: 8 }} />
      <div ref={displayRef}
        style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${initPct}%`, background: `linear-gradient(90deg,${color}55,${color}cc)`, borderRadius: 8 }} />
      <div ref={thumbRef}
        style={{ position: "absolute", left: `${initPct}%`, top: "50%", transform: "translate(-50%,-50%)", width: 22, height: 28, background: locked ? "#555" : color, borderRadius: 5, boxShadow: locked ? "none" : `0 2px 10px ${color}88`, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.2s" }}>
        {locked
          ? <span style={{ fontSize: 9, color: "#fff", opacity: 0.7 }}>🔒</span>
          : <div style={{ width: 2, height: 10, background: "rgba(0,0,0,0.25)", borderRadius: 1 }} />
        }
      </div>
    </div>
  );
}

// ── Btn44 ─────────────────────────────────────────────────────────────────────
// Standard 44×44 touch-target icon button.

export function Btn44({ onClick, danger, children, title }) {
  return (
    <button onClick={onClick} title={title}
      style={{ background: "none", border: "none", width: 36, height: 36, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, transition: "background 0.15s" }}
      onTouchStart={e => e.currentTarget.style.background = danger ? "#ff444430" : "rgba(128,128,128,0.15)"}
      onTouchEnd={e => e.currentTarget.style.background = "none"}
      onMouseEnter={e => e.currentTarget.style.background = danger ? "#ff444430" : "rgba(128,128,128,0.15)"}
      onMouseLeave={e => e.currentTarget.style.background = "none"}
    >{children}</button>
  );
}

// ── TaskCard ──────────────────────────────────────────────────────────────────

export function TaskCard({ task, stepMinutes, dayLen, totalTaskHours, T, onChange, onDelete, onEdit, onLock, onFav, isFav, onLongPressStart, onLongPressEnd }) {
  const done = !!task.done;
  const pct  = dayLen > 0 ? Math.round((task.hours / dayLen) * 100) : 0;

  // Slider colour: desaturate small tasks relative to the largest task
  const shareOfTasks = totalTaskHours > 0 ? task.hours / totalTaskHours : 0;
  const sDelta = done ? -100 : (shareOfTasks - 1) * 55;
  const lDelta = done ? 0   : (shareOfTasks - 1) * 15;
  const sliderColor = done ? "#555" : window.adjustColor(task.color, lDelta, sDelta);

  return (
    <div
      style={{ background: T.bgCard, border: `1px solid ${done ? "#404040" : T.border}`, borderRadius: 12, padding: "10px 12px 9px", marginBottom: 7, transition: "background 0.25s,border 0.25s", userSelect: "none" }}
      onPointerDown={onLongPressStart}
      onPointerUp={onLongPressEnd}
      onPointerCancel={onLongPressEnd}
      onContextMenu={e => e.preventDefault()}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
        <div style={{ cursor: "grab", padding: "0 2px", color: T.textFaint, fontSize: 12, flexShrink: 0, userSelect: "none", touchAction: "none" }}>⠿</div>
        <button onClick={onEdit} style={{ width: 16, height: 16, borderRadius: "50%", background: done ? "#555" : task.color, border: "none", flexShrink: 0, boxShadow: done ? "none" : `0 0 6px ${task.color}88`, padding: 0 }} />
        <span onClick={onEdit} style={{ fontFamily: "'Space Mono',monospace", fontSize: 12, color: done ? T.textFaint : T.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer", textDecoration: done ? "line-through" : "none" }}>
          {task.name}
        </span>
        <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 11, color: done ? T.textFaint : task.color, fontWeight: "bold", flexShrink: 0 }}>
          {window.formatHours(task.hours)}
        </span>
        <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: T.textFaint, flexShrink: 0, opacity: 0.7 }}>{pct}%</span>

        <div style={{ display: "flex", gap: 0, flexShrink: 0 }} onPointerDown={e => e.stopPropagation()}>
          <Btn44 onClick={() => onChange({ done: !done })} title={done ? "Undo" : "Done"}>
            <span style={{ fontSize: 12, opacity: done ? 1 : 0.3 }}>{done ? "✅" : "☑️"}</span>
          </Btn44>
          {!isFav && (
            <Btn44 onClick={onFav} title="Save as favourite">
              <span style={{ fontSize: 12, opacity: 0.3 }}>★</span>
            </Btn44>
          )}
          <Btn44 onClick={onLock} title={task.locked ? "Unlock" : "Lock"}>
            <span style={{ fontSize: 12, opacity: task.locked ? 1 : 0.3 }}>🔒</span>
          </Btn44>
          {!task.locked && (
            <Btn44 onClick={onDelete} danger title="Delete">
              <span style={{ fontSize: 11, color: T.textDim }}>✕</span>
            </Btn44>
          )}
        </div>
      </div>

      <div onPointerDown={e => e.stopPropagation()}>
        <Slider value={task.hours} max={dayLen} step={stepMinutes} color={sliderColor}
          locked={task.locked || done} onChange={h => onChange({ hours: h })} />
      </div>
    </div>
  );
}

// ── EditModal ─────────────────────────────────────────────────────────────────

export function EditModal({ task, T, onSave, onClose }) {
  const [name,  setName]  = useState(task.name);
  const [color, setColor] = useState(task.color);

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-sheet" style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px 16px 0 0", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: 2, color: T.text }}>EDIT TASK</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: T.textMuted, fontSize: 22, width: 44, height: 44, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>

        <label style={{ fontSize: 10, color: T.textDim, letterSpacing: 2, display: "block", marginBottom: 6 }}>TASK NAME</label>
        <input value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && onSave({ name: name.trim() || task.name, color })}
          style={{ width: "100%", background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px", color: T.text, fontFamily: "'Space Mono',monospace", fontSize: 15, marginBottom: 20 }} />

        <label style={{ fontSize: 10, color: T.textDim, letterSpacing: 2, display: "block", marginBottom: 10 }}>COLOR</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
          {window.PALETTE.map(c => (
            <button key={c} onClick={() => setColor(c)}
              style={{ width: 36, height: 36, borderRadius: "50%", background: c, border: color === c ? `3px solid ${T.text}` : "2px solid transparent", padding: 0, boxShadow: color === c ? `0 0 0 2px ${T.bg}, 0 0 0 4px ${c}` : "none", transition: "all 0.15s" }} />
          ))}
        </div>

        <button onClick={() => onSave({ name: name.trim() || task.name, color })}
          style={{ width: "100%", background: "#FF6B2B", border: "none", borderRadius: 12, padding: "15px", color: "#000", fontFamily: "'Space Mono',monospace", fontSize: 14, fontWeight: "bold", letterSpacing: 1, minHeight: 52 }}>
          SAVE CHANGES
        </button>
        <div style={{ height: "env(safe-area-inset-bottom,0px)" }} />
      </div>
    </div>
  );
}

// ── Timeline ──────────────────────────────────────────────────────────────────

export function Timeline({ tasks, T, dayLen, dayStart }) {
  const visibleTasks = tasks.filter(t => t.hours > 0.02);
  let cursor = 0;
  const segments = visibleTasks.map(t => { const s = cursor; cursor += t.hours; return { ...t, start: s }; });
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round((dayStart + f * dayLen) * 2) / 2);

  return (
    <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px 14px 10px", marginBottom: 16 }}>
      <div style={{ position: "relative", height: 36, borderRadius: 6, overflow: "hidden", background: T.bgSlider, marginBottom: 6 }}>
        {segments.map(s => {
          const left  = (s.start / dayLen) * 100;
          const width = (s.hours / dayLen) * 100;
          return (
            <div key={s.id} style={{ position: "absolute", left: `${left}%`, width: `${width}%`, top: 0, bottom: 0, background: s.done ? "#444" : s.color, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", minWidth: 2, opacity: s.done ? 0.45 : 1 }}>
              {width > 7 && <span style={{ fontSize: 9, color: "rgba(0,0,0,0.65)", fontFamily: "'Space Mono',monospace", whiteSpace: "nowrap", padding: "0 4px", fontWeight: "bold" }}>{s.name}</span>}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'Space Mono',monospace", fontSize: 9, color: T.textFaint, paddingLeft: 2, paddingRight: 2 }}>
        {ticks.map((h, i) => {
          const hh = Math.floor(h), mm = h % 1 ? "30" : "00";
          return <span key={i}>{String(hh).padStart(2, "0")}:{mm}</span>;
        })}
      </div>
    </div>
  );
}

// ── ThemeToggle ───────────────────────────────────────────────────────────────

export function ThemeToggle({ dark, onToggle, T }) {
  return (
    <button onClick={onToggle}
      style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${T.border}`, borderRadius: 20, padding: "6px 10px", minHeight: 36 }}>
      <span style={{ fontSize: 13 }}>{dark ? "☀️" : "🌙"}</span>
      <div style={{ width: 28, height: 16, borderRadius: 8, background: dark ? "#444" : T.borderMid, position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
        <div style={{ position: "absolute", top: 2, left: dark ? 12 : 2, width: 12, height: 12, borderRadius: "50%", background: "#FF6B2B", transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }} />
      </div>
    </button>
  );
}

// ── FileBtn ───────────────────────────────────────────────────────────────────

export function FileBtn({ label, onClick, danger, dark }) {
  return (
    <button onClick={onClick}
      style={{ background: danger ? (dark ? "#3a0a0a" : "#e8c0c0") : (dark ? "#0e0e10" : "#d0cec8"), border: `1px solid ${danger ? "#ff5555" : (dark ? "#505055" : "#a8a6a0")}`, borderRadius: 10, padding: "12px 10px", minHeight: 48, color: danger ? "#ff7777" : (dark ? "#cccccc" : "#2a2a2a"), fontFamily: "'Space Mono',monospace", fontSize: 10, letterSpacing: 0.5, width: "100%", transition: "opacity 0.1s" }}
      onTouchStart={e => e.currentTarget.style.opacity = "0.7"}
      onTouchEnd={e => e.currentTarget.style.opacity = "1"}
    >{label}</button>
  );
}
