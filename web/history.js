// Отмена и повтор на JSON-снимках: каждая правка — один шаг. Без DOM.
export function createHistory({ limit = 60 } = {}) {
  const undoSt = [], redoSt = [];
  let editing = null;
  const stack = (a, j) => { a.push(j); if (a.length > limit) a.shift(); };
  return {
    get canUndo() { return undoSt.length > 0; },
    get canRedo() { return redoSt.length > 0; },
    /** Запомнить состояние до правки (один раз за жест, пока не вызван end). */
    begin(json) { if (editing === null) { editing = json; stack(undoSt, json); redoSt.length = 0; } },
    /** Закончить жест: если состояние не изменилось, запись убирается. */
    end(json) { if (editing === null) return; if (json === editing) undoSt.pop(); editing = null; },
    /** Запомнить состояние без жеста. */
    snap(json) { stack(undoSt, json); redoSt.length = 0; },
    /** Вернуть снимок для восстановления; current — состояние до отмены. */
    undo(current) { const j = undoSt.pop(); if (j === undefined) return null; stack(redoSt, current); return j; },
    redo(current) { const j = redoSt.pop(); if (j === undefined) return null; stack(undoSt, current); return j; },
    clear() { undoSt.length = 0; redoSt.length = 0; editing = null; },
  };
}
