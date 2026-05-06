const Cursors = (() => {
  const cursors = {};  

  let container = null;
  let panX = 0, panY = 0, scale = 1;

  function init(containerEl) {
    container = containerEl;
  }

  function setViewport(px, py, s) {
    panX  = px;
    panY  = py;
    scale = s;

    Object.values(cursors).forEach(c => position(c));
  }

  function position(c) {
    const sx = c.data.x * scale + panX;
    const sy = c.data.y * scale + panY;
    c.el.style.left = `${sx}px`;
    c.el.style.top  = `${sy}px`;
  }

  function upsert(userId, data) {
    if (!container) return;
    if (cursors[userId]) {
      cursors[userId].data = data;

      const label = cursors[userId].el.querySelector('.cursor-label');
      if (label) {
        label.textContent = data.name;
        label.style.background = data.color;
      }
      position(cursors[userId]);
      return;
    }

    const el = document.createElement('div');
    el.className = 'remote-cursor';
    el.innerHTML = `
      <svg class="cursor-pointer" viewBox="0 0 20 20" fill="${data.color}" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 1l16 7.5L12.5 11 9.5 19 4 1z" stroke="white" stroke-width="1.2"/>
      </svg>
      <div class="cursor-label" style="background:${data.color}">${data.name}</div>
    `;
    container.appendChild(el);
    cursors[userId] = { el, data };
    position(cursors[userId]);
  }

  function remove(userId) {
    if (cursors[userId]) {
      cursors[userId].el.remove();
      delete cursors[userId];
    }
  }

  function removeAll() {
    Object.keys(cursors).forEach(remove);
  }

  return { init, setViewport, upsert, remove, removeAll };
})();

