const { useState, useRef, useEffect, useReducer } = React;

// ── App ───────────────────────────────────────────────────────────────────────

const LONG_PRESS_DELAY_MS = 400;
const TOAST_DURATION_MS   = 2500;
const CONFIRM_TIMEOUT_MS  = 3000;

export function App() {
  const [state,   dispatch]        = useReducer(window.reducer, null, window.initState);
  const [newName, setNewName]      = useState("");
  const [editTask, setEditTask]    = useState(null);
  const [toast,    setToast]       = useState(null);
  const [confirmRm, setConfirmRm]  = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showFavs, setShowFavs]    = useState(false);
  const [dragOver, setDragOver]    = useState(null);
  const [longDragIdx, setLongDragIdx] = useState(null);
  const [dragPos, setDragPos]      = useState({ x: 0, y: 0 });

  const longPressTimer  = useRef(null);
  const confirmRmTimer  = useRef(null);
  const taskListRef     = useRef();
  const fileRef         = useRef();
  const inputRef        = useRef();

  const { tasks, favs, step, dark, showTL, dayStart, dayEnd } = state;
  const dayLen    = dayEnd - dayStart;
  const T         = dark ? window.DARK : window.LIGHT;
  const total     = tasks.reduce((s, t) => s + t.hours, 0);
  const remaining = dayLen - total;
  const over      = remaining < -0.001;
  const perfect   = Math.abs(remaining) < 0.001;

  // Persist state on every change
  useEffect(() => { window.saveState(state); }, [state]);

  // Sync CSS vars + body background when theme changes
  useEffect(() => {
    document.documentElement.style.setProperty("--bg-slider", T.bgSlider);
    document.documentElement.style.setProperty("--border-mid", T.borderMid);
    document.body.style.background = T.bg;
    document.getElementById("themeColorMeta").content = T.tc;
  }, [dark]);

  // ── Toast ────────────────────────────────────────────────────────────────
  const showToast = (msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), TOAST_DURATION_MS);
  };

  // ── Confirm-remove timer (auto-cancels after timeout) ────────────────────
  const setConfirmRmWithTimer = name => {
    clearTimeout(confirmRmTimer.current);
    setConfirmRm(name);
    if (name !== null) confirmRmTimer.current = setTimeout(() => setConfirmRm(null), CONFIRM_TIMEOUT_MS);
  };

  // ── Add task ──────────────────────────────────────────────────────────────
  const addTask = (nameArg, colorArg, hoursArg) => {
    const name = (nameArg || newName).trim();
    if (!name) return;
    if (tasks.some(t => t.name.toLowerCase() === name.toLowerCase())) {
      showToast("Task already exists", "err");
      return;
    }
    dispatch({ type: "ADD_TASK", name, color: colorArg, hours: hoursArg });
    setConfirmRmWithTimer(null);
    setNewName("");
    inputRef.current?.blur();
  };

  // ── Long-press drag (list reorder) ────────────────────────────────────────
  const startLongDrag = (i, e) => {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      try { if (navigator.vibrate) navigator.vibrate([12, 40, 12]); } catch {}
      setLongDragIdx(i);
      setDragPos({ x: clientX, y: clientY });
    }, LONG_PRESS_DELAY_MS);
  };

  const cancelLongPress = () => clearTimeout(longPressTimer.current);

  useEffect(() => {
    if (longDragIdx === null) return;
    const onMove = e => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      setDragPos({ x: clientX, y: clientY });
      const els = taskListRef.current?.querySelectorAll("[data-taskcard]");
      if (!els) return;
      let found = null;
      for (let i = 0; i < els.length; i++) {
        const r = els[i].getBoundingClientRect();
        if (clientY >= r.top && clientY <= r.bottom) { found = i; break; }
      }
      setDragOver(found !== null && found !== longDragIdx ? found : null);
    };
    const onUp = () => {
      if (dragOver !== null && longDragIdx !== null && dragOver !== longDragIdx) {
        dispatch({ type: "REORDER_TASKS", from: longDragIdx, to: dragOver });
      }
      setLongDragIdx(null);
      setDragOver(null);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup",   onUp);
    window.addEventListener("touchmove",   onMove, { passive: true });
    window.addEventListener("touchend",    onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup",   onUp);
      window.removeEventListener("touchmove",   onMove);
      window.removeEventListener("touchend",    onUp);
    };
  }, [longDragIdx, dragOver]);

  // ── Export / import ───────────────────────────────────────────────────────
  const exportMD = () => {
    const blob = new Blob([window.serializeMD(tasks, dayStart, dayEnd)], { type: "text/markdown" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "sliders.md"; a.click();
    URL.revokeObjectURL(url);
    showToast("Exported ✓");
  };

  const handleFile = e => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const { tasks: parsed, dayStart: ds, dayEnd: de } = window.parseMD(ev.target.result);
      if (!parsed.length) { showToast("No tasks found", "err"); return; }
      dispatch({ type: "SET_TASKS", tasks: parsed });
      if (ds !== null && de !== null && de > ds) dispatch({ type: "SET_DAY_WINDOW", start: ds, end: de });
      showToast(`${parsed.length} tasks loaded`);
    };
    reader.readAsText(f);
    e.target.value = "";
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="main-wrap" style={{ minHeight: "100dvh", background: T.bg, color: T.text, fontFamily: "'Space Mono',monospace", maxWidth: 520, margin: "0 auto", paddingBottom: 100, transition: "background 0.25s,color 0.25s" }}>

      {/* HEADER */}
      <div className="sticky-header" style={{ background: T.bg, transition: "background 0.25s" }}>
        <div style={{ padding: "14px 16px 12px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <h1 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 36, letterSpacing: 3, color: "#FF6B2B", lineHeight: 1 }}>SLIDERS</h1>
              <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 8, color: T.textFaint, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 4, padding: "2px 5px", letterSpacing: 1 }}>{step}m</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <div style={{ textAlign: "left", width: 96, flexShrink: 0 }}>
                <div style={{ fontSize: 26, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1, lineHeight: 1, color: over ? "#ff4444" : perfect ? "#4ECDC4" : T.textSub, whiteSpace: "nowrap" }}>
                  {perfect ? `${window.formatHours(dayLen)} ✓` : window.formatHours(Math.abs(remaining))}
                </div>
                <div style={{ fontSize: 8, color: over ? "#ff4444" : T.textFaint, letterSpacing: 1 }}>
                  {over ? "OVER BY" : perfect ? "ALLOCATED" : "REMAINING"}
                </div>
              </div>
              <div style={{ flexShrink: 0, width: 66 }}>
                <window.ThemeToggle dark={dark} onToggle={() => dispatch({ type: "SET_DARK", dark: !dark })} T={T} />
              </div>
            </div>
          </div>
        </div>
        {/* Allocation progress bar */}
        <div style={{ height: 2, background: T.bgSlider, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.min(100, (total / dayLen) * 100)}%`, background: over ? "#ff4444" : perfect ? "#4ECDC4" : "#FF6B2B", transition: "width 0.2s,background 0.2s", borderRadius: "0 2px 2px 0" }} />
        </div>
      </div>

      <div style={{ padding: "0 16px" }}>

        {/* DONUT + CIRCULAR SLIDER */}
        <div style={{ margin: "12px 0", padding: "16px 16px 12px", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ position: "relative", width: 220, height: 220, flexShrink: 0, margin: "14px 16px" }}>
              <window.CircularDaySlider
                dayStart={dayStart} dayEnd={dayEnd} T={T}
                onChange={(s, e) => dispatch({ type: "SET_DAY_WINDOW", start: s, end: e })}
              />
              <window.Donut tasks={tasks} T={T} dayLen={dayLen}
                onReorder={(from, to) => dispatch({ type: "REORDER_TASKS", from, to })} />
            </div>

            {/* Legend + start now */}
            <div style={{ flex: 1, overflow: "hidden", minWidth: 0, display: "flex", flexDirection: "column", gap: 0 }}>
              {tasks.map(t => {
                const pct   = dayLen > 0 ? Math.max(2, (t.hours / dayLen) * 100) : 0;
                const color = t.done ? "#555" : t.color;
                return (
                  <div key={t.id} style={{ marginBottom: 7, opacity: t.done ? 0.4 : 1, transition: "opacity 0.2s" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
                      <span style={{ fontSize: 10, color: t.done ? T.textFaint : T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: t.done ? "line-through" : "none", maxWidth: "65%", fontFamily: "'Space Mono',monospace" }}>{t.name}</span>
                      <span style={{ fontSize: 9, color, flexShrink: 0, fontFamily: "'Space Mono',monospace", opacity: 0.9 }}>{window.formatHours(t.hours)}</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 3, background: T.bgSlider, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, borderRadius: 3, background: color, boxShadow: t.done ? "none" : `0 0 6px ${color}66`, transition: "width 0.3s" }} />
                    </div>
                  </div>
                );
              })}

              {remaining > 0.001 && (
                <div style={{ marginBottom: 7, opacity: 0.5 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
                    <span style={{ fontSize: 10, color: T.textMuted, fontFamily: "'Space Mono',monospace" }}>free</span>
                    <span style={{ fontSize: 9, color: T.textMuted, fontFamily: "'Space Mono',monospace" }}>{window.formatHours(remaining)}</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 3, background: T.bgSlider, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.max(2, (remaining / dayLen) * 100)}%`, borderRadius: 3, background: T.borderMid, transition: "width 0.3s" }} />
                  </div>
                </div>
              )}

              {tasks.length === 0 && <span style={{ fontSize: 10, color: T.textFaint }}>No tasks yet</span>}

              <button
                onClick={() => {
                  const now = new Date();
                  const totalMins = now.getHours() * 60 + now.getMinutes();
                  const snapped = Math.ceil(totalMins / step) * step;
                  dispatch({ type: "SET_DAY_START", start: Math.min(snapped / 60, 23.5) });
                  showToast("Start → now ✓");
                }}
                style={{ marginTop: 6, background: "none", border: `1px solid ${T.borderMid}`, borderRadius: 8, padding: "7px 10px", color: T.textMuted, fontFamily: "'Space Mono',monospace", fontSize: 9, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, transition: "all 0.15s", letterSpacing: 0.5 }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#4ECDC4"; e.currentTarget.style.color = "#4ECDC4"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = T.borderMid; e.currentTarget.style.color = T.textMuted; }}
                onTouchStart={e => { e.currentTarget.style.borderColor = "#4ECDC4"; e.currentTarget.style.color = "#4ECDC4"; }}
                onTouchEnd={e => { e.currentTarget.style.borderColor = T.borderMid; e.currentTarget.style.color = T.textMuted; }}
              ><span>⏱</span> start now</button>
            </div>
          </div>
        </div>

        {/* TIMELINE */}
        {showTL && <window.Timeline tasks={tasks} T={T} dayLen={dayLen} dayStart={dayStart} />}

        {/* SETTINGS */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ marginBottom: 6 }}>
            <button onClick={() => setShowSettings(v => !v)}
              style={{ width: "100%", background: "none", border: `1px solid ${T.border}`, borderRadius: 10, padding: "9px 14px", color: T.textMuted, fontFamily: "'Space Mono',monospace", fontSize: 10, letterSpacing: 1, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
              <span>⚙ SETTINGS</span>
              <span style={{ fontSize: 11 }}>{showSettings ? "▲" : "▼"}</span>
            </button>
          </div>

          {showSettings && (
            <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px 16px", animation: "slideIn 0.15s ease" }}>

              {/* Timeline toggle */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${T.border}`, marginBottom: 12 }}>
                <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 11, color: T.textSub }}>Timeline view</span>
                <button onClick={() => dispatch({ type: "SET_SHOW_TL", v: !showTL })}
                  style={{ width: 44, height: 24, borderRadius: 12, background: showTL ? "#FF6B2B" : "#484850", border: "none", position: "relative", cursor: "pointer", transition: "background 0.2s", flexShrink: 0 }}>
                  <div style={{ position: "absolute", top: 3, left: showTL ? 22 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }} />
                </button>
              </div>

              {/* Snap size */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 9, color: T.textDim, letterSpacing: 1.5, marginBottom: 8, fontFamily: "'Space Mono',monospace" }}>SNAP SIZE</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {window.STEPS.map(s => {
                    const active = s.m === step;
                    return (
                      <button key={s.m} onClick={() => dispatch({ type: "SET_STEP", step: s.m })}
                        style={{ flex: 1, background: active ? "#FF6B2B" : T.bgInput, border: `1px solid ${active ? "#FF6B2B" : T.border}`, borderRadius: 8, padding: "8px 0", color: active ? "#000" : T.textMuted, fontFamily: "'Space Mono',monospace", fontSize: 11, fontWeight: active ? "bold" : "normal", transition: "all 0.15s" }}>
                        {s.l}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* File export/import */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 9, color: T.textDim, letterSpacing: 1.5, marginBottom: 8, fontFamily: "'Space Mono',monospace" }}>FILE</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <window.FileBtn label="⬇ EXPORT .MD" onClick={exportMD} dark={dark} />
                  <window.FileBtn label="⬆ IMPORT .MD" onClick={() => fileRef.current.click()} dark={dark} />
                </div>
              </div>
              <input ref={fileRef} type="file" accept=".md" style={{ display: "none" }} onChange={handleFile} />

              {/* Danger zone */}
              <div>
                <div style={{ fontSize: 9, color: T.textDim, letterSpacing: 1.5, marginBottom: 8, fontFamily: "'Space Mono',monospace" }}>DANGER</div>
                {!confirmReset ? (
                  <button onClick={() => setConfirmReset(true)}
                    style={{ width: "100%", background: "none", border: "1px solid #cc3333", borderRadius: 10, padding: "10px", color: "#cc3333", fontFamily: "'Space Mono',monospace", fontSize: 10, letterSpacing: 1, cursor: "pointer" }}>
                    ⚠ RESET APP
                  </button>
                ) : (
                  <div style={{ background: "#1a0000", border: "1px solid #ff2222", borderRadius: 10, padding: "14px", animation: "slideIn 0.15s ease" }}>
                    <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 11, color: "#ff4444", marginBottom: 12, lineHeight: 1.6 }}>
                      Reset everything?<br />
                      <span style={{ fontSize: 9, color: "#cc4444", opacity: 0.8 }}>Tasks, favourites and settings will be wiped.</span>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => { localStorage.removeItem(window.STORAGE_KEY); window.location.reload(); }}
                        style={{ flex: 1, background: "#cc0000", border: "none", borderRadius: 8, padding: "10px", color: "#fff", fontFamily: "'Space Mono',monospace", fontSize: 11, fontWeight: "bold", minHeight: 44 }}>YES</button>
                      <button onClick={() => setConfirmReset(false)}
                        style={{ flex: 1, background: "none", border: `1px solid ${dark ? "#505055" : "#a8a6a0"}`, borderRadius: 8, padding: "10px", color: T.textMuted, fontFamily: "'Space Mono',monospace", fontSize: 11, minHeight: 44 }}>CANCEL</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* FAVOURITES */}
        <div style={{ marginBottom: 12 }}>
          <button onClick={() => setShowFavs(v => !v)}
            style={{ width: "100%", background: "none", border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 16px", color: T.textMuted, fontFamily: "'Space Mono',monospace", fontSize: 10, letterSpacing: 1, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", marginBottom: showFavs ? 8 : 0, transition: "margin 0.15s" }}>
            <span>★ FAVOURITES{favs.length > 0 ? ` (${favs.length})` : ""}</span>
            <span style={{ fontSize: 12 }}>{showFavs ? "▲" : "▼"}</span>
          </button>

          {showFavs && (
            <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px", animation: "slideIn 0.15s ease" }}>
              {favs.length === 0 && (
                <div style={{ textAlign: "center", padding: "16px 0", fontFamily: "'Space Mono',monospace", fontSize: 11, color: T.textFaint, letterSpacing: 1 }}>NO FAVOURITES YET — STAR A TASK</div>
              )}
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {favs.map(f => {
                  const active  = tasks.some(t => t.name.toLowerCase() === f.name.toLowerCase());
                  const pending = confirmRm === f.name;
                  const MAX_CHARS = 14;
                  const displayName = pending ? "tap to cancel" : (f.name.length > MAX_CHARS ? f.name.slice(0, MAX_CHARS) + "…" : f.name);
                  return (
                    <div key={f.name} style={{ display: "flex", alignItems: "center", borderRadius: 10, overflow: "hidden", border: `1px solid ${pending ? "#ff5555" : active ? f.color : T.border}`, opacity: active ? 0.45 : 1, transition: "all 0.15s" }}>
                      <button
                        onClick={() => { if (pending) { setConfirmRmWithTimer(null); return; } if (!active) addTask(f.name, f.color, f.hours); }}
                        style={{ background: pending ? "#3a0a0a" : active ? T.bgCard : `${f.color}22`, border: "none", padding: "8px 12px", display: "flex", alignItems: "center", gap: 7, cursor: active && !pending ? "default" : "pointer", minHeight: 40 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: pending ? "#ff5555" : f.color, flexShrink: 0 }} />
                        <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 11, color: pending ? "#ff7777" : active ? T.textFaint : T.text, whiteSpace: "nowrap" }}>{displayName}</span>
                        {!pending && <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, color: f.color, opacity: 0.8 }}>{window.formatHours(f.hours)}</span>}
                      </button>
                      <button
                        onClick={() => pending ? (dispatch({ type: "DEL_FAV", name: f.name }), setConfirmRmWithTimer(null)) : setConfirmRmWithTimer(f.name)}
                        style={{ background: pending ? "#ff444430" : "none", border: "none", borderLeft: `1px solid ${pending ? "#ff5555" : T.border}`, padding: "8px 10px", color: pending ? "#ff5555" : T.textDim, fontSize: 11, cursor: "pointer", minHeight: 40, display: "flex", alignItems: "center", fontFamily: "'Space Mono',monospace", transition: "all 0.15s" }}
                        onMouseEnter={e => { if (!pending) e.currentTarget.style.color = "#ff5555"; }}
                        onMouseLeave={e => { if (!pending) e.currentTarget.style.color = T.textDim; }}
                      >{pending ? "remove" : "✕"}</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* TASKS */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 2, fontFamily: "'Space Mono',monospace" }}>
              TASKS{tasks.length > 0 ? ` · ${tasks.filter(t => t.done).length}/${tasks.length} done` : ""}
            </div>
            {tasks.length > 1 && (
              <button
                onClick={() => { dispatch({ type: "DISTRIBUTE" }); showToast("Distributed ✓"); }}
                style={{ background: "none", border: `1px solid ${T.borderMid}`, borderRadius: 7, padding: "4px 10px", color: T.textMuted, fontFamily: "'Space Mono',monospace", fontSize: 9, cursor: "pointer", letterSpacing: 0.5, transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#4ECDC4"; e.currentTarget.style.color = "#4ECDC4"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = T.borderMid; e.currentTarget.style.color = T.textMuted; }}
              >⇄ distribute</button>
            )}
          </div>

          {tasks.length === 0 && (
            <div style={{ textAlign: "center", padding: "28px 0 20px", borderRadius: 12, border: `1px dashed ${T.border}` }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>📋</div>
              <div style={{ fontSize: 11, color: T.textFaint, letterSpacing: 1 }}>No tasks yet</div>
              <div style={{ fontSize: 10, color: T.textFaint, opacity: 0.6, marginTop: 4 }}>Add one below ↓</div>
            </div>
          )}

          <div ref={taskListRef} style={{ opacity: longDragIdx !== null ? 0.92 : 1, transition: "opacity 0.2s" }}>
            {tasks.map((t, i) => {
              const isFloating = longDragIdx === i;
              const isOver     = dragOver === i;
              return (
                <div key={t.id} data-taskcard={i}
                  style={{ opacity: isFloating ? 0.25 : 1, transform: isOver ? "translateY(-3px) scale(1.01)" : isFloating ? "scale(0.97)" : "none", transition: "opacity 0.2s,transform 0.15s", filter: isOver ? `drop-shadow(0 4px 12px ${t.color}55)` : "none", borderRadius: 12 }}>
                  <window.TaskCard task={t} stepMinutes={step} dayLen={dayLen} totalTaskHours={total} T={T}
                    onChange={patch => dispatch({ type: "UPD_TASK", id: t.id, patch })}
                    onDelete={() => dispatch({ type: "DEL_TASK", id: t.id })}
                    onEdit={() => setEditTask({ ...t })}
                    onLock={() => dispatch({ type: "UPD_TASK", id: t.id, patch: { locked: !t.locked } })}
                    isFav={favs.some(f => f.name.toLowerCase() === t.name.toLowerCase())}
                    onFav={() => {
                      if (favs.some(f => f.name.toLowerCase() === t.name.toLowerCase()))
                        dispatch({ type: "DEL_FAV", name: t.name });
                      else
                        dispatch({ type: "ADD_FAV", task: t });
                    }}
                    onLongPressStart={e => startLongDrag(i, e)}
                    onLongPressEnd={cancelLongPress}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* FLOATING DRAG CARD */}
        {longDragIdx !== null && tasks[longDragIdx] && (() => {
          const t = tasks[longDragIdx];
          return (
            <div style={{ position: "fixed", left: dragPos.x - 140, top: dragPos.y - 28, width: 280, zIndex: 300, pointerEvents: "none", animation: "floatIn 0.15s ease", filter: `drop-shadow(0 8px 24px ${t.color}66)` }}>
              <div style={{ background: T.bgCard, border: `2px solid ${t.color}`, borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, transform: "rotate(-1.5deg) scale(1.04)" }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: t.color, boxShadow: `0 0 8px ${t.color}` }} />
                <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 12, color: T.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 11, color: t.color, fontWeight: "bold" }}>{window.formatHours(t.hours)}</span>
              </div>
            </div>
          );
        })()}

        {/* ADD TASK */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          <input ref={inputRef} value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addTask()}
            placeholder="Add a task…"
            style={{ flex: 1, background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 10, padding: "13px 16px", color: T.text, fontFamily: "'Space Mono',monospace", fontSize: 14, transition: "border-color 0.2s" }}
            onFocus={e => e.target.style.borderColor = "#FF6B2B"}
            onBlur={e => e.target.style.borderColor = T.border}
          />
          <button onClick={() => addTask()}
            style={{ background: "#FF6B2B", border: "none", borderRadius: 10, padding: "13px 18px", color: "#000", fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, letterSpacing: 1, flexShrink: 0, minWidth: 70, minHeight: 52, transition: "opacity 0.1s" }}
            onTouchStart={e => e.currentTarget.style.opacity = "0.75"}
            onTouchEnd={e => e.currentTarget.style.opacity = "1"}
            onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
            onMouseLeave={e => e.currentTarget.style.opacity = "1"}
          >ADD</button>
        </div>
      </div>

      {/* EDIT MODAL */}
      {editTask && (
        <window.EditModal task={editTask} T={T}
          onSave={patch => { dispatch({ type: "UPD_TASK", id: editTask.id, patch }); setEditTask(null); showToast("Task updated ✓"); }}
          onClose={() => setEditTask(null)} />
      )}

      {/* TOAST */}
      {toast && (
        <div style={{ position: "fixed", bottom: "calc(20px + env(safe-area-inset-bottom,0px))", left: "50%", transform: "translateX(-50%)", zIndex: 200, background: toast.type === "err" ? "#ff444422" : "#FF6B2B22", border: `1px solid ${toast.type === "err" ? "#ff4444" : "#FF6B2B"}`, borderRadius: 24, padding: "12px 22px", fontFamily: "'Space Mono',monospace", fontSize: 12, color: toast.type === "err" ? "#ff7777" : "#FF6B2B", animation: "toastIn 0.2s ease", whiteSpace: "nowrap", backdropFilter: "blur(8px)" }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
