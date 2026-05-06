const Canvas = (() => {
  let gridCanvas, strokesCanvas, overlayCanvas;
  let gCtx, sCtx, oCtx;
  let W = 0, H = 0;

  let strokes = [];

  let drawing = false;
  let activePoints = [];
  let activeTool   = null;

  let panX = 0, panY = 0, scale = 1;

  function init(gc, sc, oc) {
    gridCanvas    = gc;
    strokesCanvas = sc;
    overlayCanvas = oc;
    gCtx = gc.getContext('2d');
    sCtx = sc.getContext('2d');
    oCtx = oc.getContext('2d');
    resize();
  }

  function resize() {
    const area = gridCanvas.parentElement;
    W = area.clientWidth;
    H = area.clientHeight;
    [gridCanvas, strokesCanvas, overlayCanvas].forEach(c => {
      c.width  = W;
      c.height = H;
    });
    redrawAll();
  }

  function setViewport(px, py, s) {
    panX  = px;
    panY  = py;
    scale = s;
    redrawAll();
  }

  function worldToScreen(wx, wy) {
    return { x: wx * scale + panX, y: wy * scale + panY };
  }
  function screenToWorld(sx, sy) {
    return { x: (sx - panX) / scale, y: (sy - panY) / scale };
  }

  function drawGrid() {
    gCtx.clearRect(0, 0, W, H);
    const grid = Tools.getGrid();
    if (!grid.enabled) return;

    const step = grid.size * scale;
    const offX = ((panX % step) + step) % step;
    const offY = ((panY % step) + step) % step;

    gCtx.strokeStyle = grid.color;
    gCtx.lineWidth   = 1;
    gCtx.beginPath();
    for (let x = offX - step; x < W + step; x += step) {
      gCtx.moveTo(x, 0);
      gCtx.lineTo(x, H);
    }
    for (let y = offY - step; y < H + step; y += step) {
      gCtx.moveTo(0, y);
      gCtx.lineTo(W, y);
    }
    gCtx.stroke();
  }

  function renderStroke(ctx, points, color, size, opacity, isEraser) {
    if (points.length === 0) return;
    ctx.save();
    ctx.globalAlpha = opacity;
    if (isEraser) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color;
    }
    ctx.lineWidth  = size * scale;
    ctx.lineCap    = 'round';
    ctx.lineJoin   = 'round';

    ctx.beginPath();
    const s0 = worldToScreen(points[0].x, points[0].y);
    ctx.moveTo(s0.x, s0.y);

    if (points.length === 1) {
      ctx.arc(s0.x, s0.y, (size * scale) / 2, 0, Math.PI * 2);
      ctx.fillStyle = isEraser ? 'rgba(0,0,0,1)' : color;
      ctx.fill();
    } else {
      for (let i = 1; i < points.length - 1; i++) {
        const sa = worldToScreen(points[i].x,   points[i].y);
        const sb = worldToScreen(points[i+1].x, points[i+1].y);
        ctx.quadraticCurveTo(sa.x, sa.y, (sa.x + sb.x) / 2, (sa.y + sb.y) / 2);
      }
      const sl = worldToScreen(points[points.length - 1].x, points[points.length - 1].y);
      ctx.lineTo(sl.x, sl.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function redrawStrokes() {
    sCtx.clearRect(0, 0, W, H);
    for (const s of strokes) {
      renderStroke(sCtx, s.points, s.color, s.size, s.opacity, s.isEraser);
    }
  }

  function redrawAll() {
    drawGrid();
    redrawStrokes();
    oCtx.clearRect(0, 0, W, H);
  }

  function startDraw(sx, sy) {
    drawing = true;
    activePoints = [];
    const w = screenToWorld(sx, sy);
    activePoints.push(w);
    const tool = Tools.get();
    if (tool === 'brush') {
      activeTool = { ...Tools.getBrush(), isEraser: false };
    } else {
      activeTool = { ...Tools.getEraser(), color: '#000', opacity: 1, isEraser: true };
    }
  }

  function moveDraw(sx, sy) {
    if (!drawing) return;
    const w = screenToWorld(sx, sy);

    const last = activePoints[activePoints.length - 1];
    const dx = (w.x - last.x) * scale;
    const dy = (w.y - last.y) * scale;
    if (dx * dx + dy * dy < 2) return;
    activePoints.push(w);

    oCtx.clearRect(0, 0, W, H);
    renderStroke(oCtx, activePoints, activeTool.color, activeTool.size, activeTool.opacity || 1, activeTool.isEraser);
  }

  function endDraw() {
    if (!drawing || activePoints.length === 0) { drawing = false; return; }
    drawing = false;
    oCtx.clearRect(0, 0, W, H);

    if (activePoints.length === 0) return;

    const stroke = {
      type: 'stroke',
      points: activePoints,
      color:  activeTool.color,
      size:   activeTool.size,
      opacity: activeTool.opacity || 1,
      isEraser: activeTool.isEraser,
    };

    return stroke; 

  }

  function addStroke(id, data) {

    if (strokes.find(s => s.id === id)) return;
    strokes.push({ id, ...data });
    renderStroke(sCtx, data.points, data.color, data.size, data.opacity, data.isEraser);
  }

  function removeStroke(id) {
    strokes = strokes.filter(s => s.id !== id);
    redrawStrokes();
  }

  function clearStrokes() {
    strokes = [];
    sCtx.clearRect(0, 0, W, H);
  }

  return {
    init, resize, setViewport,
    startDraw, moveDraw, endDraw,
    addStroke, removeStroke, clearStrokes,
    redrawAll, drawGrid,
    screenToWorld, worldToScreen,
    get drawing() { return drawing; },
  };
})();

