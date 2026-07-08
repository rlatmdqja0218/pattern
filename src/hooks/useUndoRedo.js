import { useCallback, useReducer } from 'react';

function resolveValue(value, currentValue) {
  return typeof value === 'function' ? value(currentValue) : value;
}

function undoRedoReducer(state, action) {
  if (action.type === 'set') {
    const next = resolveValue(action.value, state.present);
    if (Object.is(next, state.present)) return state;

    return {
      past: [...state.past, state.present].slice(-action.limit),
      present: next,
      future: [],
      lastAction: 'set',
    };
  }

  if (action.type === 'replace') {
    const next = resolveValue(action.value, state.present);
    if (Object.is(next, state.present)) return state;
    return { ...state, present: next, lastAction: 'replace' };
  }

  if (action.type === 'commit') {
    if (!action.previous || Object.is(action.previous, state.present)) return state;
    return {
      past: [...state.past, action.previous].slice(-action.limit),
      present: state.present,
      future: [],
      lastAction: 'commit',
    };
  }

  if (action.type === 'undo') {
    if (!state.past.length) return state;
    return {
      past: state.past.slice(0, -1),
      present: state.past.at(-1),
      future: [state.present, ...state.future].slice(0, action.limit),
      lastAction: 'undo',
    };
  }

  if (action.type === 'redo') {
    if (!state.future.length) return state;
    return {
      past: [...state.past, state.present].slice(-action.limit),
      present: state.future[0],
      future: state.future.slice(1),
      lastAction: 'redo',
    };
  }

  if (action.type === 'reset') {
    return {
      past: [],
      present: action.value,
      future: [],
      lastAction: 'reset',
    };
  }

  return state;
}

export function useUndoRedo(initialState, { limit = 80 } = {}) {
  const [history, dispatch] = useReducer(undoRedoReducer, {
    past: [],
    present: initialState,
    future: [],
    lastAction: 'reset',
  });

  const set = useCallback((value) => {
    dispatch({ type: 'set', value, limit });
  }, [limit]);

  const replace = useCallback((value) => {
    dispatch({ type: 'replace', value });
  }, []);

  const commit = useCallback((previous) => {
    dispatch({ type: 'commit', previous, limit });
  }, [limit]);

  const undo = useCallback(() => {
    dispatch({ type: 'undo', limit });
  }, [limit]);

  const redo = useCallback(() => {
    dispatch({ type: 'redo', limit });
  }, [limit]);

  const reset = useCallback((value) => {
    dispatch({ type: 'reset', value });
  }, []);

  return {
    present: history.present,
    set,
    replace,
    commit,
    undo,
    redo,
    reset,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    lastAction: history.lastAction,
  };
}
