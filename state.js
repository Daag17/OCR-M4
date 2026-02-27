let state = {
  status: "idle",
  file: null,
  fileName: null,
  fileSizeMB: null,
  totalPages: 0,
  processedPages: 0,
  progress: 0,
  startTime: null,
  downloadUrl: null,
  error: null,
};

const listeners = [];

export function getState() {
  return state;
}

export function setState(newState) {
  state = { ...state, ...newState };
  listeners.forEach((listener) => listener(state));
}

export function subscribe(listener) {
  listeners.push(listener);
}
