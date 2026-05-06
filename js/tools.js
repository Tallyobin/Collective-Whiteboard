const Tools = (() => {
  const state = {
    current: 'select',
    brush: { color: '#1C1A18', size: 4, opacity: 1 },
    eraser: { size: 20 },
    text: { color: '#1C1A18', fontSize: 18, fontFamily: 'Outfit' },
    sticky: { bgColor: '#FFF3B0', fontSize: 13 },
    icon: { color: '#1C1A18', size: 48, selected: null },
    bg: '#F0EEE9',
    grid: { enabled: false, size: 40, color: 'rgba(0,0,0,0.07)' },
  };

  const listeners = {};

  function on(event, fn) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(fn);
  }
  function emit(event, data) {
    (listeners[event] || []).forEach(fn => fn(data));
  }

  function set(tool) {
    const prev = state.current;
    state.current = tool;
    emit('toolchange', { tool, prev });
  }

  function get() { return state.current; }

  function getBrush() { return { ...state.brush }; }
  function setBrush(props) {
    Object.assign(state.brush, props);
    emit('brushchange', { ...state.brush });
  }

  function getEraser() { return { ...state.eraser }; }
  function setEraser(props) {
    Object.assign(state.eraser, props);
    emit('eraserchange', { ...state.eraser });
  }

  function getText() { return { ...state.text }; }
  function setText(props) {
    Object.assign(state.text, props);
    emit('textchange', { ...state.text });
  }

  function getSticky() { return { ...state.sticky }; }
  function setSticky(props) {
    Object.assign(state.sticky, props);
    emit('stickychange', { ...state.sticky });
  }

  function getIcon() { return { ...state.icon }; }
  function setIcon(props) {
    Object.assign(state.icon, props);
    emit('iconchange', { ...state.icon });
  }

  function getGrid() { return { ...state.grid }; }
  function setGrid(props) {
    Object.assign(state.grid, props);
    emit('gridchange', { ...state.grid });
  }
  function toggleGrid() {
    state.grid.enabled = !state.grid.enabled;
    emit('gridchange', { ...state.grid });
    return state.grid.enabled;
  }

  function getBg() { return state.bg; }
  function setBg(color) {
    state.bg = color;
    emit('bgchange', color);
  }

  return {
    on, set, get,
    getBrush, setBrush,
    getEraser, setEraser,
    getText, setText,
    getSticky, setSticky,
    getIcon, setIcon,
    getGrid, setGrid, toggleGrid,
    getBg, setBg,
  };
})();

