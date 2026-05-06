(function () {

  const params   = new URLSearchParams(location.search);
  const ROOM_ID  = params.get('room');
  const USER_NAME= params.get('name') || 'Anon';
  const USER_ID  = 'u' + Math.random().toString(36).slice(2, 10);

  if (!ROOM_ID) { location.href = 'index.html'; return; }

  const $ = id => document.getElementById(id);
  const canvasArea   = $('canvas-area');
  const viewport     = $('viewport');
  const gridCanvas   = $('grid-canvas');
  const strokesCanvas= $('strokes-canvas');
  const overlayCanvas= $('overlay-canvas');
  const presenceList = $('presence-list');
  const roomIdDisplay= $('room-id-display');
  const copyBadge    = $('copy-badge');
  const zoomPct      = $('zoom-pct');
  const propsPanel   = $('props-panel');
  const toastContainer= $('toast-container');
  const shortcutsModal= $('shortcuts-modal');

  let panX = 0, panY = 0, scale = 1;
  let isPanning = false;
  let panStart  = { x: 0, y: 0, panX: 0, panY: 0 };
  let spaceDown = false;
  const MIN_SCALE = 0.05;
  const MAX_SCALE = 8;

  const elements = {};        

  let selectedId = null;
  let dragging   = null;      

  let resizing   = null;      

  let undoStack  = [];        

  function init() {
    Canvas.init(gridCanvas, strokesCanvas, overlayCanvas);
    Cursors.init(canvasArea);
    applyViewport();

    roomIdDisplay.textContent = ROOM_ID;

    const sess = Sync.init(ROOM_ID, USER_ID, USER_NAME);

    Sync.initMeta({
      bgColor: Tools.getBg(),
      gridEnabled: false,
      gridSize: 40,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
    });

    Sync.getMeta().then(meta => {
      if (meta) {
        if (meta.bgColor)     { Tools.setBg(meta.bgColor);  updateBgColor(meta.bgColor); }
        if (meta.gridEnabled !== undefined) { Tools.setGrid({ enabled: meta.gridEnabled }); updateGridUI(); }
        if (meta.gridSize)    { Tools.setGrid({ size: meta.gridSize }); }
      }
    });

    Sync.on('onElementAdded',   onElementAdded);
    Sync.on('onElementChanged', onElementChanged);
    Sync.on('onElementRemoved', onElementRemoved);
    Sync.on('onPresenceChanged',onPresenceChanged);
    Sync.on('onPresenceRemoved',onPresenceRemoved);
    Sync.on('onMetaChanged',    onMetaChanged);

    addMyAvatar(sess);

    bindCanvasEvents();
    bindToolbarEvents();
    bindPropsEvents();
    bindKeyboard();
    bindDragDrop();
    bindModals();

    new ResizeObserver(() => { Canvas.resize(); applyViewport(); }).observe(canvasArea);

    setTool('select');
  }

  function applyViewport() {
    viewport.style.transform = `translate(${panX}px,${panY}px) scale(${scale})`;
    Canvas.setViewport(panX, panY, scale);
    Cursors.setViewport(panX, panY, scale);
    zoomPct.textContent = Math.round(scale * 100) + '%';
  }

  function zoom(delta, cx, cy) {
    const factor = delta > 0 ? 1.1 : 0.9;
    const ns = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
    const r  = ns / scale;
    panX = cx - r * (cx - panX);
    panY = cy - r * (cy - panY);
    scale = ns;
    applyViewport();
  }

  function resetView() {
    panX = 0; panY = 0; scale = 1;
    applyViewport();
  }

  function setTool(tool) {
    Tools.set(tool);
    canvasArea.className = `tool-${tool}`;
    document.querySelectorAll('.tool-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tool === tool);
    });
    updatePropsPanel(tool);
  }

  function bindCanvasEvents() {
    canvasArea.addEventListener('mousedown', onMouseDown);
    canvasArea.addEventListener('mousemove', onMouseMove);
    canvasArea.addEventListener('mouseup',   onMouseUp);
    canvasArea.addEventListener('mouseleave',onMouseLeave);
    canvasArea.addEventListener('wheel',     onWheel, { passive: false });
    canvasArea.addEventListener('contextmenu', e => e.preventDefault());
  }

  function onMouseDown(e) {
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      isPanning = true;
      canvasArea.classList.add('panning');
      panStart = { x: e.clientX, y: e.clientY, panX, panY };
      e.preventDefault(); return;
    }
    if (e.button !== 0) return;

    const tool = Tools.get();
    const { wx, wy } = getWorldPos(e);

    if (tool === 'brush' || tool === 'eraser') {
      Canvas.startDraw(e.offsetX, e.offsetY);
    } else if (tool === 'select') {

      const target = e.target.closest('.wb-element');
      if (target) {
        const id = target.dataset.id;
        if (e.target.classList.contains('delete-handle')) { removeElement(id); return; }
        if (e.target.classList.contains('resize-handle')) {
          const el = elements[id];
          if (!el) return;
          resizing = { id, startW: el.data.width || 200, startH: el.data.height || 200,
                       startMX: e.clientX, startMY: e.clientY };
          e.stopPropagation(); return;
        }
        selectElement(id);
        const el = elements[id];
        if (!el) return;
        dragging = { id, startMouseX: e.clientX, startMouseY: e.clientY,
                     startElX: el.data.x, startElY: el.data.y };
        e.stopPropagation();
      } else {
        deselectAll();
      }
    } else if (tool === 'sticky') {
      placeSticky(wx, wy);
    } else if (tool === 'text') {
      placeText(wx, wy);
    } else if (tool === 'image') {
      $('image-upload-input').click();
    }
  }

  function onMouseMove(e) {
    if (isPanning) {
      panX = panStart.panX + (e.clientX - panStart.x);
      panY = panStart.panY + (e.clientY - panStart.y);
      applyViewport(); return;
    }

    const tool = Tools.get();
    const { wx, wy } = getWorldPos(e);

    Sync.updatePresence(wx, wy, tool);

    if (Canvas.drawing) {
      Canvas.moveDraw(e.offsetX, e.offsetY); return;
    }

    if (dragging) {
      const dx = (e.clientX - dragging.startMouseX) / scale;
      const dy = (e.clientY - dragging.startMouseY) / scale;
      const nx = dragging.startElX + dx;
      const ny = dragging.startElY + dy;
      moveElement(dragging.id, nx, ny);
      return;
    }

    if (resizing) {
      const dx = (e.clientX - resizing.startMX) / scale;
      const dy = (e.clientY - resizing.startMY) / scale;
      const nw = Math.max(80, resizing.startW + dx);
      const nh = Math.max(60, resizing.startH + dy);
      resizeElement(resizing.id, nw, nh);
      return;
    }
  }

  function onMouseUp(e) {
    if (isPanning) {
      isPanning = false;
      canvasArea.classList.remove('panning');
      return;
    }
    const tool = Tools.get();
    if (Canvas.drawing) {
      const stroke = Canvas.endDraw();
      if (stroke && stroke.points.length > 0) {
        const id = Sync.addElement(stroke);
        Canvas.addStroke(id, stroke);
        undoStack.push({ type: 'add', id });
        if (undoStack.length > 100) undoStack.shift();
      }
    }
    if (dragging) {
      const el = elements[dragging.id];
      if (el) Sync.updateElement(dragging.id, { x: el.data.x, y: el.data.y });
      dragging = null;
    }
    if (resizing) {
      const el = elements[resizing.id];
      if (el) Sync.updateElement(resizing.id, { width: el.data.width, height: el.data.height });
      resizing = null;
    }
  }

  function onMouseLeave(e) {
    if (Canvas.drawing) onMouseUp(e);
    if (isPanning) { isPanning = false; canvasArea.classList.remove('panning'); }
  }

  function onWheel(e) {
    e.preventDefault();
    const rect = canvasArea.getBoundingClientRect();
    zoom(-e.deltaY, e.clientX - rect.left, e.clientY - rect.top);
  }

  function getWorldPos(e) {
    return Canvas.screenToWorld(e.offsetX, e.offsetY);

  }

  function worldPos(e) {
    const p = Canvas.screenToWorld(e.offsetX, e.offsetY);
    return { wx: p.x, wy: p.y };
  }

  Object.defineProperty(window, '_gwp', { value: (e) => {
    const p = Canvas.screenToWorld(e.offsetX, e.offsetY);
    return { wx: p.x, wy: p.y };
  }});

  canvasArea.removeEventListener('mousedown', onMouseDown);
  canvasArea.addEventListener('mousedown', function(e) {
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      isPanning = true;
      canvasArea.classList.add('panning');
      panStart = { x: e.clientX, y: e.clientY, panX, panY };
      e.preventDefault(); return;
    }
    if (e.button !== 0) return;

    const tool = Tools.get();
    const p = Canvas.screenToWorld(e.offsetX, e.offsetY);
    const wx = p.x, wy = p.y;

    if (tool === 'brush' || tool === 'eraser') {
      Canvas.startDraw(e.offsetX, e.offsetY);
    } else if (tool === 'select') {
      const target = e.target.closest('.wb-element');
      if (target) {
        const id = target.dataset.id;
        if (e.target.classList.contains('delete-handle')) { removeElement(id); return; }
        if (e.target.classList.contains('resize-handle')) {
          const el = elements[id];
          if (!el) return;
          resizing = { id, startW: el.data.width || 200, startH: el.data.height || 200,
                       startMX: e.clientX, startMY: e.clientY };
          e.stopPropagation(); return;
        }
        selectElement(id);
        const el = elements[id];
        if (!el) return;
        dragging = { id, startMouseX: e.clientX, startMouseY: e.clientY,
                     startElX: el.data.x, startElY: el.data.y };
        e.stopPropagation();
      } else {
        deselectAll();
      }
    } else if (tool === 'sticky') {
      placeSticky(wx, wy);
    } else if (tool === 'text') {
      placeText(wx, wy);
    } else if (tool === 'image') {
      $('image-upload-input').click();
    }
  });

  function placeSticky(wx, wy) {
    const opts = Tools.getSticky();
    const data = {
      type: 'sticky',
      x: wx - 100, y: wy - 80,
      width: 200, height: 160,
      content: '',
      bgColor: opts.bgColor,
      fontSize: opts.fontSize,
    };
    const id = Sync.addElement(data);
    undoStack.push({ type: 'add', id });
    setTool('select');
  }

  function placeText(wx, wy) {
    const opts = Tools.getText();
    const data = {
      type: 'text',
      x: wx, y: wy,
      content: '',
      fontSize: opts.fontSize,
      fontFamily: opts.fontFamily,
      color: opts.color,
    };
    const id = Sync.addElement(data);
    undoStack.push({ type: 'add', id });
    setTool('select');

    setTimeout(() => {
      const el = elements[id];
      if (el && el.el) {
        const tc = el.el.querySelector('.text-content');
        if (tc) { tc.focus(); placeCaretAtEnd(tc); }
      }
    }, 80);
  }

  function placeIcon(wx, wy, iconData) {
    const opts = Tools.getIcon();
    const data = {
      type: 'icon',
      x: wx - opts.size / 2,
      y: wy - opts.size / 2,
      size: opts.size,
      iconName: iconData.name,
      iconPath: iconData.path,
      color: opts.color,
    };
    const id = Sync.addElement(data);
    undoStack.push({ type: 'add', id });
  }

  function handleImageFile(file, wx, wy) {
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 600;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else       { w = Math.round(w * MAX / h); h = MAX; }
        }
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        const src = cv.toDataURL('image/jpeg', 0.82);

        const data = {
          type: 'image',
          x: wx - w / 2, y: wy - h / 2,
          width: w, height: h,
          src,
        };
        const id = Sync.addElement(data);
        undoStack.push({ type: 'add', id });
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  function renderElement(id, data) {
    if (data.type === 'stroke') {
      Canvas.addStroke(id, data);
      elements[id] = { data };
      return;
    }

    let el = document.createElement('div');
    el.className = 'wb-element';
    el.dataset.id = id;
    el.style.left = `${data.x}px`;
    el.style.top  = `${data.y}px`;

    if (data.type === 'sticky') {
      el.classList.add('sticky-note');
      el.style.background = data.bgColor || '#FFF3B0';
      el.style.width   = `${data.width  || 200}px`;
      el.style.height  = `${data.height || 160}px`;
      const ta = document.createElement('textarea');
      ta.value       = data.content || '';
      ta.placeholder = 'Write something...';
      ta.style.fontSize = `${data.fontSize || 13}px`;
      ta.addEventListener('input', () => {
        Sync.updateElement(id, { content: ta.value });
      });
      ta.addEventListener('mousedown', e => e.stopPropagation());
      el.appendChild(ta);

    } else if (data.type === 'text') {
      el.classList.add('text-el');
      const div = document.createElement('div');
      div.className = 'text-content';
      div.contentEditable = 'true';
      div.textContent = data.content || '';
      div.style.fontSize  = `${data.fontSize  || 18}px`;
      div.style.fontFamily= data.fontFamily || 'Outfit';
      div.style.color     = data.color || '#1C1A18';
      div.addEventListener('input', () => {
        Sync.updateElement(id, { content: div.textContent });
      });
      div.addEventListener('mousedown', e => e.stopPropagation());
      el.appendChild(div);

    } else if (data.type === 'image') {
      el.classList.add('image-el');
      el.style.width  = `${data.width  || 300}px`;
      el.style.height = `${data.height || 200}px`;
      const img = document.createElement('img');
      img.src    = data.src;
      img.style.width  = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      img.draggable = false;
      el.appendChild(img);

    } else if (data.type === 'icon') {
      el.classList.add('icon-el');
      el.style.width  = `${data.size || 48}px`;
      el.style.height = `${data.size || 48}px`;
      el.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
             width="${data.size||48}" height="${data.size||48}"
             fill="none" stroke="${data.color||'#1C1A18'}"
             stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="${data.iconPath}"/>
        </svg>`;
    }

    const del = document.createElement('div');
    del.className = 'delete-handle';
    del.innerHTML = '×';
    del.title = 'Delete';
    el.appendChild(del);

    if (['sticky','image'].includes(data.type)) {
      const rz = document.createElement('div');
      rz.className = 'resize-handle';
      el.appendChild(rz);
    }

    viewport.appendChild(el);
    elements[id] = { data: { ...data }, el };
  }

  function updateElementDOM(id, data) {
    const e = elements[id];
    if (!e) return;
    Object.assign(e.data, data);

    if (data.type === 'stroke') { return; } 

    const el = e.el;
    if (!el) return;

    if ('x' in data) el.style.left = `${data.x}px`;
    if ('y' in data) el.style.top  = `${data.y}px`;

    if (data.type === 'sticky') {
      if ('bgColor'  in data) el.style.background = data.bgColor;
      if ('width'    in data) el.style.width  = `${data.width}px`;
      if ('height'   in data) el.style.height = `${data.height}px`;
      if ('content'  in data) {
        const ta = el.querySelector('textarea');
        if (ta && document.activeElement !== ta) ta.value = data.content;
      }
      if ('fontSize' in data) {
        const ta = el.querySelector('textarea');
        if (ta) ta.style.fontSize = `${data.fontSize}px`;
      }
    } else if (data.type === 'text') {
      const div = el.querySelector('.text-content');
      if (div) {
        if ('content'    in data && document.activeElement !== div) div.textContent = data.content;
        if ('fontSize'   in data) div.style.fontSize   = `${data.fontSize}px`;
        if ('fontFamily' in data) div.style.fontFamily = data.fontFamily;
        if ('color'      in data) div.style.color      = data.color;
      }
    } else if (data.type === 'image') {
      if ('width'  in data) el.style.width  = `${data.width}px`;
      if ('height' in data) el.style.height = `${data.height}px`;
    } else if (data.type === 'icon') {
      if ('color' in data || 'size' in data || 'iconPath' in data) {
        const d   = e.data;
        el.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
               width="${d.size||48}" height="${d.size||48}"
               fill="none" stroke="${d.color||'#1C1A18'}"
               stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="${d.iconPath}"/>
          </svg>
          <div class="delete-handle">×</div>`;
        el.style.width  = `${d.size||48}px`;
        el.style.height = `${d.size||48}px`;
      }
    }
  }

  function selectElement(id) {
    deselectAll();
    selectedId = id;
    const el = elements[id];
    if (el && el.el) el.el.classList.add('selected');
    updatePropsPanel(Tools.get(), id);
  }

  function deselectAll() {
    if (selectedId && elements[selectedId]?.el)
      elements[selectedId].el.classList.remove('selected');
    selectedId = null;
  }

  function removeElement(id) {
    const el = elements[id];
    if (!el) return;
    if (el.el) el.el.remove();
    Canvas.removeStroke(id);
    Sync.removeElement(id);
    delete elements[id];
    if (selectedId === id) selectedId = null;
  }

  function moveElement(id, x, y) {
    const el = elements[id];
    if (!el || !el.el) return;
    el.data.x = x; el.data.y = y;
    el.el.style.left = `${x}px`;
    el.el.style.top  = `${y}px`;
  }

  function resizeElement(id, w, h) {
    const el = elements[id];
    if (!el || !el.el) return;
    el.data.width = w; el.data.height = h;
    el.el.style.width  = `${w}px`;
    el.el.style.height = `${h}px`;
  }

  function onElementAdded(id, data) {
    if (elements[id]) return; 

    renderElement(id, data);
  }

  function onElementChanged(id, data) {
    if (!elements[id]) { renderElement(id, data); return; }
    updateElementDOM(id, data);
  }

  function onElementRemoved(id) {
    const el = elements[id];
    if (el?.el) el.el.remove();
    Canvas.removeStroke(id);
    delete elements[id];
    if (selectedId === id) selectedId = null;
  }

  function onPresenceChanged(uid, data) {
    Cursors.upsert(uid, data);
    updatePresenceAvatar(uid, data);
  }

  function onPresenceRemoved(uid) {
    Cursors.remove(uid);
    removePresenceAvatar(uid);
  }

  function onMetaChanged(meta) {
    if (meta.bgColor)           updateBgColor(meta.bgColor);
    if (meta.gridEnabled !== undefined) {
      Tools.setGrid({ enabled: meta.gridEnabled });
      Canvas.drawGrid();
    }
    if (meta.gridSize) {
      Tools.setGrid({ size: meta.gridSize });
      Canvas.drawGrid();
    }
  }

  function addMyAvatar(sess) {
    const av = document.createElement('div');
    av.className = 'presence-avatar';
    av.style.background = sess.userColor;
    av.textContent = (sess.userName || 'A')[0].toUpperCase();
    av.title = sess.userName + ' (you)';
    av.dataset.uid = 'me';
    presenceList.appendChild(av);
  }

  function updatePresenceAvatar(uid, data) {
    let av = presenceList.querySelector(`[data-uid="${uid}"]`);
    if (!av) {
      av = document.createElement('div');
      av.className = 'presence-avatar';
      av.dataset.uid = uid;
      presenceList.appendChild(av);
    }
    av.style.background = data.color;
    av.textContent = (data.name || 'A')[0].toUpperCase();
    av.title = data.name;
  }

  function removePresenceAvatar(uid) {
    const av = presenceList.querySelector(`[data-uid="${uid}"]`);
    if (av) av.remove();
  }

  function updateBgColor(color) {
    Tools.setBg(color);
    canvasArea.style.background = color;
    document.getElementById('bg-color-swatch').style.background = color;
    document.getElementById('bg-color-input').value = color;
  }

  function updateGridUI() {
    const grid = Tools.getGrid();
    const btn  = document.querySelector('[data-tool="grid"]');
    if (btn) btn.classList.toggle('active', grid.enabled);
    Canvas.drawGrid();
  }

  function updatePropsPanel(tool, selId) {
    const sections = propsPanel.querySelectorAll('.props-section');
    sections.forEach(s => s.style.display = 'none');

    if (tool === 'brush' || tool === 'eraser') {
      document.getElementById('brush-props').style.display = 'block';
    } else if (tool === 'sticky' || (selId && elements[selId]?.data.type === 'sticky')) {
      document.getElementById('sticky-props').style.display = 'block';
    } else if (tool === 'text' || (selId && elements[selId]?.data.type === 'text')) {
      document.getElementById('text-props').style.display = 'block';
    } else if (selId && elements[selId]?.data.type === 'icon') {
      document.getElementById('icon-props').style.display = 'block';
    }
    document.getElementById('canvas-props').style.display = 'block';
  }

  function bindToolbarEvents() {
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.tool;
        if (t === 'grid') {
          const enabled = Tools.toggleGrid();
          Canvas.drawGrid();
          Sync.updateMeta({ gridEnabled: enabled });
          btn.classList.toggle('active', enabled);
        } else if (t === 'icons') {
          openModal('icons-modal');
        } else if (t === 'shortcuts') {
          openModal('shortcuts-modal');
        } else {
          setTool(t);
          if (t === 'image') $('image-upload-input').click();
        }
      });
    });

    document.getElementById('zoom-in-btn').addEventListener('click', () => {
      const c = canvasArea.getBoundingClientRect();
      zoom(1, c.width/2, c.height/2);
    });
    document.getElementById('zoom-out-btn').addEventListener('click', () => {
      const c = canvasArea.getBoundingClientRect();
      zoom(-1, c.width/2, c.height/2);
    });
    zoomPct.addEventListener('click', resetView);

    roomIdDisplay.addEventListener('click', () => {
      navigator.clipboard.writeText(ROOM_ID).then(() => {
        copyBadge.classList.add('visible');
        setTimeout(() => copyBadge.classList.remove('visible'), 1800);
      });
    });

    const imgInput = $('image-upload-input');
    imgInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const rect = canvasArea.getBoundingClientRect();
        const p = Canvas.screenToWorld(rect.width / 2, rect.height / 2);
        handleImageFile(file, p.x, p.y);
      }
      imgInput.value = '';
    });
  }

  function bindPropsEvents() {

    const brushColor = document.getElementById('brush-color-input');
    brushColor.addEventListener('input', () => {
      Tools.setBrush({ color: brushColor.value });
      document.getElementById('brush-color-swatch').style.background = brushColor.value;
    });

    const brushSize = document.getElementById('brush-size');
    brushSize.addEventListener('input', () => {
      Tools.setBrush({ size: +brushSize.value });
      document.getElementById('brush-size-val').textContent = brushSize.value;
    });

    document.querySelectorAll('#brush-props .palette-swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        const c = sw.dataset.color;
        Tools.setBrush({ color: c });
        brushColor.value = c;
        document.getElementById('brush-color-swatch').style.background = c;
        document.querySelectorAll('#brush-props .palette-swatch').forEach(s => s.classList.remove('active'));
        sw.classList.add('active');
      });
    });

    const textColor = document.getElementById('text-color-input');
    textColor.addEventListener('input', () => {
      Tools.setText({ color: textColor.value });
      if (selectedId && elements[selectedId]?.data.type === 'text') {
        Sync.updateElement(selectedId, { color: textColor.value });
      }
    });
    document.getElementById('text-font-size').addEventListener('input', function() {
      Tools.setText({ fontSize: +this.value });
      document.getElementById('text-size-val').textContent = this.value;
      if (selectedId && elements[selectedId]?.data.type === 'text') {
        Sync.updateElement(selectedId, { fontSize: +this.value });
      }
    });
    document.getElementById('text-font-family').addEventListener('change', function() {
      Tools.setText({ fontFamily: this.value });
      if (selectedId && elements[selectedId]?.data.type === 'text') {
        Sync.updateElement(selectedId, { fontFamily: this.value });
      }
    });

    document.querySelectorAll('.sticky-color-swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        const c = sw.dataset.color;
        Tools.setSticky({ bgColor: c });
        document.querySelectorAll('.sticky-color-swatch').forEach(s => s.classList.remove('active'));
        sw.classList.add('active');
        if (selectedId && elements[selectedId]?.data.type === 'sticky') {
          Sync.updateElement(selectedId, { bgColor: c });
        }
      });
    });

    const bgInput  = document.getElementById('bg-color-input');
    bgInput.addEventListener('input', () => {
      updateBgColor(bgInput.value);
      Sync.updateMeta({ bgColor: bgInput.value });
    });
    document.querySelectorAll('.bg-color-swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        const c = sw.dataset.color;
        updateBgColor(c);
        Sync.updateMeta({ bgColor: c });
      });
    });

    const iconColor = document.getElementById('icon-color-input');
    iconColor?.addEventListener('input', () => {
      Tools.setIcon({ color: iconColor.value });
      if (selectedId && elements[selectedId]?.data.type === 'icon') {
        Sync.updateElement(selectedId, { color: iconColor.value });
      }
    });
    document.getElementById('icon-size')?.addEventListener('input', function() {
      Tools.setIcon({ size: +this.value });
      document.getElementById('icon-size-val').textContent = this.value;
      if (selectedId && elements[selectedId]?.data.type === 'icon') {
        Sync.updateElement(selectedId, { size: +this.value,
          width: +this.value, height: +this.value });
      }
    });
  }

  function bindDragDrop() {
    canvasArea.addEventListener('dragover', e => {
      e.preventDefault();
      canvasArea.classList.add('drag-over');
    });
    canvasArea.addEventListener('dragleave', () => {
      canvasArea.classList.remove('drag-over');
    });
    canvasArea.addEventListener('drop', e => {
      e.preventDefault();
      canvasArea.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) {
        const rect = canvasArea.getBoundingClientRect();
        const p = Canvas.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        handleImageFile(file, p.x, p.y);
      }
    });
  }

  function bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      const tag = document.activeElement.tagName;
      const editable = ['INPUT','TEXTAREA'].includes(tag) || document.activeElement.isContentEditable;
      if (editable && !e.ctrlKey && !e.metaKey) return;

      if (e.code === 'Space' && !editable) { spaceDown = true; e.preventDefault(); }

      const key = e.key.toLowerCase();

      if (e.ctrlKey || e.metaKey) {
        if (key === 'z') { e.preventDefault(); undo(); return; }
        if (key === '0') { e.preventDefault(); resetView(); return; }
        if (key === '=') { e.preventDefault(); const c = canvasArea.getBoundingClientRect(); zoom(1, c.width/2, c.height/2); return; }
        if (key === '-') { e.preventDefault(); const c = canvasArea.getBoundingClientRect(); zoom(-1, c.width/2, c.height/2); return; }
      }

      if (editable) return;

      const toolMap = { v:'select', b:'brush', t:'text', n:'sticky', e:'eraser' };
      if (toolMap[key]) { setTool(toolMap[key]); return; }
      if (key === 'g')  { const en = Tools.toggleGrid(); Canvas.drawGrid(); Sync.updateMeta({ gridEnabled: en }); updateGridUI(); return; }
      if (key === 'i')  { openModal('icons-modal'); return; }
      if (key === '?')  { openModal('shortcuts-modal'); return; }

      if ((key === 'delete' || key === 'backspace') && selectedId) {
        removeElement(selectedId); return;
      }
      if (key === 'escape') { deselectAll(); setTool('select'); return; }
    });

    document.addEventListener('keyup', (e) => {
      if (e.code === 'Space') spaceDown = false;
    });
  }

  function undo() {
    const action = undoStack.pop();
    if (!action) { toast('Nothing to undo'); return; }
    if (action.type === 'add') removeElement(action.id);
  }

  function openModal(id) {
    const m = $(`${id}-backdrop`) || document.querySelector(`#${id}`).closest?.('.modal-backdrop') || buildModalBackdrop(id);
    if (m) m.classList.add('open');
    if (id === 'icons-modal') renderIconsGrid('');
  }

  function closeModal(id) {
    const m = $(`${id}-backdrop`);
    if (m) m.classList.remove('open');
  }

  function buildModalBackdrop(id) {
    return document.querySelector('.modal-backdrop'); 

  }

  function bindModals() {
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', e => {
        if (e.target === backdrop) backdrop.classList.remove('open');
      });
    });
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.closest('.modal-backdrop').classList.remove('open');
      });
    });

    const iconSearch = document.getElementById('icon-search');
    iconSearch?.addEventListener('input', () => renderIconsGrid(iconSearch.value));

    document.querySelectorAll('.icon-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.icon-cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderIconsGrid(iconSearch?.value || '', btn.dataset.cat);
      });
    });
  }

  let currentIconCat = '';
  function renderIconsGrid(query, cat) {
    if (cat !== undefined) currentIconCat = cat;
    const grid = document.getElementById('icons-grid');
    if (!grid) return;

    const q = (query || '').toLowerCase();
    let icons = ALL_ICONS;
    if (currentIconCat && currentIconCat !== 'all') icons = icons.filter(i => i.category === currentIconCat);
    if (q) icons = icons.filter(i => i.name.includes(q) || i.category.toLowerCase().includes(q));

    grid.innerHTML = icons.map(ic => `
      <div class="icon-item" data-name="${ic.name}" data-path="${ic.path}" title="${ic.name}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="${ic.path}"/>
        </svg>
        <span>${ic.name}</span>
      </div>
    `).join('');

    grid.querySelectorAll('.icon-item').forEach(item => {
      item.addEventListener('click', () => {
        const rect = canvasArea.getBoundingClientRect();
        const p = Canvas.screenToWorld(rect.width / 2, rect.height / 2);
        placeIcon(p.x, p.y, { name: item.dataset.name, path: item.dataset.path });
        closeModal('icons-modal');
        toast(`Added "${item.dataset.name}" icon`);
      });
    });
  }

  function toast(msg, duration = 2000) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    toastContainer.appendChild(el);
    setTimeout(() => {
      el.classList.add('removing');
      setTimeout(() => el.remove(), 200);
    }, duration);
  }

  function placeCaretAtEnd(el) {
    const range = document.createRange();
    const sel   = window.getSelection();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  document.addEventListener('DOMContentLoaded', init);
})();

