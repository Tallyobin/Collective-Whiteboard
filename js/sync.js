const Sync = (() => {
  let roomId = null;
  let userId = null;
  let userName = null;
  let userColor = null;
  let roomRef = null;
  let elementsRef = null;
  let presenceRef = null;
  let myPresenceRef = null;
  let metaRef = null;

  const callbacks = {
    onElementAdded:   () => {},
    onElementChanged: () => {},
    onElementRemoved: () => {},
    onPresenceChanged:() => {},
    onPresenceRemoved:() => {},
    onMetaChanged:    () => {},
  };

  function uid() {
    return Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
  }

  const USER_COLORS = [
    '#3D6678','#6B5B95','#88B04B','#C0392B','#D4824A',
    '#1A535C','#7B2D8B','#2D6B48','#E67E22','#2980B9',
  ];
  function randomColor() {
    return USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
  }

  function init(rid, uid_, uname) {
    roomId    = rid;
    userId    = uid_;
    userName  = uname;
    userColor = randomColor();

    roomRef     = db.ref(`rooms/${roomId}`);
    elementsRef = db.ref(`rooms/${roomId}/elements`);
    presenceRef = db.ref(`rooms/${roomId}/presence`);
    metaRef     = db.ref(`rooms/${roomId}/meta`);
    myPresenceRef = db.ref(`rooms/${roomId}/presence/${userId}`);

    myPresenceRef.onDisconnect().remove();

    myPresenceRef.set({
      name: userName,
      color: userColor,
      x: 0, y: 0,
      tool: 'select',
      lastSeen: firebase.database.ServerValue.TIMESTAMP,
    });

    elementsRef.on('child_added', snap => {
      if (snap.exists()) callbacks.onElementAdded(snap.key, snap.val());
    });
    elementsRef.on('child_changed', snap => {
      if (snap.exists()) callbacks.onElementChanged(snap.key, snap.val());
    });
    elementsRef.on('child_removed', snap => {
      callbacks.onElementRemoved(snap.key);
    });

    presenceRef.on('child_added',   snap => {
      if (snap.key !== userId && snap.exists())
        callbacks.onPresenceChanged(snap.key, snap.val());
    });
    presenceRef.on('child_changed', snap => {
      if (snap.key !== userId && snap.exists())
        callbacks.onPresenceChanged(snap.key, snap.val());
    });
    presenceRef.on('child_removed', snap => {
      callbacks.onPresenceRemoved(snap.key);
    });

    metaRef.on('value', snap => {
      if (snap.exists()) callbacks.onMetaChanged(snap.val());
    });

    return { userId, userColor, userName };
  }

  function addElement(data) {
    const id  = uid();
    const ref = elementsRef.child(id);
    ref.set({ ...data, id, createdAt: firebase.database.ServerValue.TIMESTAMP });
    return id;
  }

  function updateElement(id, data) {
    elementsRef.child(id).update({ ...data, updatedAt: firebase.database.ServerValue.TIMESTAMP });
  }

  function removeElement(id) {
    elementsRef.child(id).remove();
  }

  function getAllElements() {
    return elementsRef.once('value').then(snap => {
      const result = {};
      snap.forEach(child => { result[child.key] = child.val(); });
      return result;
    });
  }

  let presenceThrottle = 0;
  function updatePresence(x, y, tool) {
    const now = Date.now();
    if (now - presenceThrottle < 33) return; 

    presenceThrottle = now;
    myPresenceRef.update({ x, y, tool, lastSeen: firebase.database.ServerValue.TIMESTAMP });
  }

  function updateMeta(data) {
    metaRef.update(data);
  }

  function getMeta() {
    return metaRef.once('value').then(snap => snap.val() || {});
  }

  function initMeta(defaults) {
    metaRef.once('value').then(snap => {
      if (!snap.exists()) metaRef.set(defaults);
    });
  }

  return {
    init,
    uid,
    get userId()    { return userId;    },
    get userColor() { return userColor; },
    get userName()  { return userName;  },
    addElement,
    updateElement,
    removeElement,
    getAllElements,
    updatePresence,
    updateMeta,
    getMeta,
    initMeta,
    on(event, fn) { if (event in callbacks) callbacks[event] = fn; },
  };
})();

