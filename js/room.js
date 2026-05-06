(function () {
  const RECENT_KEY = 'wb_recent_rooms';
  const MAX_RECENT = 6;

  const $ = id => document.getElementById(id);

  const ADJECTIVES = ['swift','calm','bold','deep','warm','keen','fine','rich','vast','pure'];
  const NOUNS      = ['wave','beam','path','leaf','star','peak','flow','mist','dawn','glow'];
  function genRoomId() {
    const adj  = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const num  = Math.floor(100 + Math.random() * 900);
    return `${adj}-${noun}-${num}`;
  }

  function enterRoom(roomId, name) {
    if (!name.trim()) { showError('create-error', 'Enter your name'); return; }
    if (!roomId.trim()) { showError('join-error', 'Enter a room ID'); return; }

    saveRecent(roomId, name);
    showLoading(`Joining room ${roomId}…`);

    const ref = db.ref(`rooms/${roomId}/meta`);
    ref.once('value').then(() => {
      const params = new URLSearchParams({ room: roomId, name: name.trim() });
      location.href = `whiteboard.html?${params}`;
    }).catch(() => {
      hideLoading();
      showError('join-error', 'Connection failed. Check Firebase config.');
    });
  }

  $('create-btn').addEventListener('click', () => {
    const name   = $('create-name').value.trim();
    const roomId = genRoomId();
    enterRoom(roomId, name);
  });

  $('create-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') $('create-btn').click();
  });

  $('join-btn').addEventListener('click', () => {
    const name   = $('join-name').value.trim();
    const roomId = $('join-id').value.trim().toLowerCase();
    enterRoom(roomId, name);
  });

  $('join-id').addEventListener('keydown', e => {
    if (e.key === 'Enter') $('join-btn').click();
  });

  function saveRecent(roomId, name) {
    let rooms = getRecent();
    rooms = rooms.filter(r => r.id !== roomId);
    rooms.unshift({ id: roomId, name, time: Date.now() });
    if (rooms.length > MAX_RECENT) rooms = rooms.slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(rooms));
  }

  function getRecent() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); }
    catch { return []; }
  }

  function renderRecent() {
    const rooms = getRecent();
    const list  = $('recent-list');
    const wrap  = $('recent-rooms');
    if (!rooms.length) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'block';

    list.innerHTML = rooms.map(r => `
      <div class="recent-item" data-room="${r.id}" data-name="${r.name}" style="animation-delay:${rooms.indexOf(r)*40}ms">
        <div class="recent-item-left">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="3" y1="9" x2="21" y2="9"/>
            <line x1="9" y1="21" x2="9" y2="9"/>
          </svg>
          <div>
            <div class="recent-item-name">${r.id}</div>
            <div class="recent-item-id">Joined as ${r.name}</div>
          </div>
        </div>
        <div class="recent-item-time">${timeAgo(r.time)}</div>
      </div>
    `).join('');

    list.querySelectorAll('.recent-item').forEach(item => {
      item.addEventListener('click', () => {
        const roomId = item.dataset.room;
        const name   = $('create-name').value.trim() || $('join-name').value.trim() || item.dataset.name;
        if (!name) {
          $('join-id').value = roomId;
          $('join-name').focus();
          return;
        }
        enterRoom(roomId, name);
      });
    });
  }

  function timeAgo(ts) {
    const d = Date.now() - ts;
    if (d < 60000)   return 'just now';
    if (d < 3600000) return `${Math.floor(d/60000)}m ago`;
    if (d < 86400000)return `${Math.floor(d/3600000)}h ago`;
    return `${Math.floor(d/86400000)}d ago`;
  }

  function showError(id, msg) {
    const el = $(id);
    if (el) { el.textContent = msg; setTimeout(() => { if(el) el.textContent = ''; }, 3000); }
  }
  function showLoading(msg) {
    const ov = document.querySelector('.loading-overlay');
    if (ov) { ov.querySelector('.loading-text').textContent = msg; ov.classList.add('active'); }
  }
  function hideLoading() {
    const ov = document.querySelector('.loading-overlay');
    if (ov) ov.classList.remove('active');
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderRecent();
    $('create-name').focus();
  });
})();

