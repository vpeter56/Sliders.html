import { DEFAULT_TASKS, STORAGE_KEY, PALETTE, FLOAT_TOLERANCE } from "./constants.js";
import { loadState, snapToStep, scaleTasksToTotal } from "./helpers.js";

// ── Initial state ─────────────────────────────────────────────────────────────

export function initState() {
  const saved = loadState();
  return {
    tasks:    saved?.tasks    ?? DEFAULT_TASKS,
    favs:     saved?.favs     ?? [],
    step:     saved?.step     ?? 15,
    dark:     saved?.dark     ?? true,
    showTL:   saved?.showTL   ?? false,
    dayStart: saved?.dayStart ?? 0,
    dayEnd:   saved?.dayEnd   ?? 24,
  };
}

// ── Reducer ───────────────────────────────────────────────────────────────────

export function reducer(state, action) {
  const dayLength = state.dayEnd - state.dayStart;

  switch (action.type) {

    case "ADD_TASK": {
      const { name, color, hours } = action;
      const matchingFav = state.favs.find(f => f.name.toLowerCase() === name.toLowerCase());
      const totalAllocated = state.tasks.reduce((s, t) => s + t.hours, 0);
      const remaining = Math.max(0, dayLength - totalAllocated);
      const rawHours = hours !== undefined
        ? hours
        : matchingFav
          ? matchingFav.hours
          : snapToStep(Math.min(state.step / 60, remaining), state.step);
      const clampedHours = Math.max(0, Math.min(rawHours, remaining || state.step / 60));
      const resolvedColor = color || matchingFav?.color || PALETTE[state.tasks.length % PALETTE.length];
      return {
        ...state,
        tasks: [
          ...state.tasks,
          { id: Date.now(), name, hours: clampedHours, originalHours: clampedHours, color: resolvedColor, locked: false, actual: 0 },
        ],
      };
    }

    case "UPD_TASK": {
      const updatedTasks = state.tasks.map(t => {
        if (t.id !== action.id) return t;
        const updated = { ...t, ...action.patch };
        // When the user manually moves a slider, sync originalHours too
        if (action.patch.hours !== undefined) updated.originalHours = action.patch.hours;
        return updated;
      });

      // Keep favourites in sync when hours or color changes
      let updatedFavs = state.favs;
      if (action.patch.hours !== undefined || action.patch.color !== undefined) {
        const originalTask = state.tasks.find(t => t.id === action.id);
        if (originalTask && state.favs.some(f => f.name.toLowerCase() === originalTask.name.toLowerCase())) {
          updatedFavs = state.favs.map(f =>
            f.name.toLowerCase() === originalTask.name.toLowerCase()
              ? {
                  ...f,
                  ...(action.patch.hours !== undefined && { hours: action.patch.hours }),
                  ...(action.patch.color !== undefined && { color: action.patch.color }),
                }
              : f
          );
        }
      }
      return { ...state, tasks: updatedTasks, favs: updatedFavs };
    }

    case "DEL_TASK":
      return { ...state, tasks: state.tasks.filter(t => t.id !== action.id) };

    case "SET_TASKS":
      return { ...state, tasks: action.tasks };

    case "ADD_FAV": {
      const t = action.task;
      if (state.favs.some(f => f.name.toLowerCase() === t.name.toLowerCase())) return state;
      return { ...state, favs: [...state.favs, { name: t.name, hours: t.hours, color: t.color }] };
    }

    case "DEL_FAV":
      return { ...state, favs: state.favs.filter(f => f.name.toLowerCase() !== action.name.toLowerCase()) };

    case "DISTRIBUTE": {
      const unlocked = state.tasks.filter(t => !t.locked);
      if (!unlocked.length) return state;
      const lockedHours = state.tasks.filter(t => t.locked).reduce((s, t) => s + t.hours, 0);
      const hoursEach = snapToStep((dayLength - lockedHours) / unlocked.length, state.step);
      return {
        ...state,
        tasks: state.tasks.map(t => t.locked ? t : { ...t, hours: hoursEach, originalHours: hoursEach }),
      };
    }

    case "SET_DAY_WINDOW": {
      const { start, end } = action;
      const newLength = end - start;
      if (newLength <= 0) return state;
      const oldLength = state.dayEnd - state.dayStart;
      // If the window grew, restore each task to its originalHours first, then
      // shrink-only logic handles the case where the restored sum still exceeds newLength.
      const restored = newLength > oldLength
        ? state.tasks.map(t => ({ ...t, hours: t.originalHours ?? t.hours }))
        : state.tasks;
      const scaled = scaleTasksToTotal(restored, newLength);
      return { ...state, dayStart: start, dayEnd: end, tasks: scaled };
    }

    case "SET_DAY_START": {
      const { start } = action;
      if (start >= state.dayEnd) return state;
      const newLength = state.dayEnd - start;
      const scaled = scaleTasksToTotal(state.tasks, newLength);
      return { ...state, dayStart: start, tasks: scaled };
    }

    case "REORDER_TASKS": {
      const { from, to } = action;
      const tasks = [...state.tasks];
      const [moved] = tasks.splice(from, 1);
      tasks.splice(to, 0, moved);
      return { ...state, tasks };
    }

    case "SET_STEP":    return { ...state, step:   action.step };
    case "SET_DARK":    return { ...state, dark:   action.dark };
    case "SET_SHOW_TL": return { ...state, showTL: action.v   };

    default: return state;
  }
}
