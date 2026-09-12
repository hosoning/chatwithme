/* ============ Firebase Realtime Database 云端同步 ============ */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCFbblyrEXmg7ZSNJwJeCQBYMKHed4fHZk",
  authDomain: "chatwithme-6238a.firebaseapp.com",
  databaseURL: "https://chatwithme-6238a-default-rtdb.firebaseio.com",
  projectId: "chatwithme-6238a",
  storageBucket: "chatwithme-6238a.firebasestorage.app",
  messagingSenderId: "160412914629",
  appId: "1:160412914629:web:b9bbc3f3ebd045f42931ac"
};

const CLOUD_CFG_KEY = 'tarot_cloud_config_v1';
const WEB_PUSH_VAPID_KEY = 'BPF6XZ5vE-GVkSA2jhxZhXCJY4-yVxSl5v_7jZ_DNq_UBKxCu8y36amCox9Ba9vqnBMuM159IF2uCTH63aROfwY';

function getCloudConfig() {
  const def = { enabled: false, roomId: '' };
  try {
    const raw = localStorage.getItem(CLOUD_CFG_KEY);
    return raw ? { ...def, ...JSON.parse(raw) } : def;
  } catch (e) { console.error(e); return def; }
}
function saveCloudConfig(cfg) {
  try { localStorage.setItem(CLOUD_CFG_KEY, JSON.stringify(cfg)); } catch (e) { console.error(e); }
}

let _fbApp = null, _fbDb = null, _fbAuth = null, _fbAuthReady = null;

function canonicalCloudValue(value) {
  if (value == null) return undefined;
  if (Array.isArray(value)) {
    if (!value.length) return undefined;
    return value.map(item => canonicalCloudValue(item) ?? null);
  }
  if (typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      const next = canonicalCloudValue(value[key]);
      if (next !== undefined && !(typeof next === 'object' && !Array.isArray(next) && !Object.keys(next).length)) out[key] = next;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return value;
}
function cloudFingerprint(value) {
  const text = JSON.stringify(canonicalCloudValue(value) || {});
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ('00000000' + (hash >>> 0).toString(16)).slice(-8);
}

function initFirebase() {
  try {
    if (!_fbApp) {
      _fbApp = firebase.initializeApp(FIREBASE_CONFIG);
      _fbAuth = firebase.auth();
      _fbDb = firebase.database();
    }
    return _fbDb;
  } catch (e) {
    console.error('Firebase 初始化失败', e);
    return null;
  }
}

async function ensureFirebaseAuth() {
  initFirebase();
  if (!_fbAuth) throw new Error('Firebase Auth SDK 尚未载入');
  if (_fbAuth.currentUser) return _fbAuth.currentUser;
  if (!_fbAuthReady) {
    _fbAuthReady = _fbAuth.signInAnonymously()
      .then(result => result.user)
      .catch(error => {
        _fbAuthReady = null;
        throw error;
      });
  }
  return _fbAuthReady;
}

async function registerPushDevice(contacts = [], autoMsg = false, forceRefresh = false) {
  if (!('serviceWorker' in navigator) || !('Notification' in window) || Notification.permission !== 'granted') return false;
  if (!firebase.messaging || !(await firebase.messaging.isSupported())) return false;
  const user = await ensureFirebaseAuth();
  const registration = await navigator.serviceWorker.ready;
  const ref = _fbDb.ref(`push_devices/${user.uid}`);
  const current = (await ref.once('value')).val() || {};
  const messaging = firebase.messaging();
  if (forceRefresh || (current.enabled === false && current.disabledAt)) {
    try { await messaging.deleteToken(); } catch (e) { console.warn('清理旧推送 Token 失败，将继续重新注册', e); }
  }
  const token = await messaging.getToken({
    vapidKey: WEB_PUSH_VAPID_KEY,
    serviceWorkerRegistration: registration
  });
  if (!token) throw new Error('未能取得推送装置 Token');
  const roster = (contacts || []).map(c => ({ id: String(c.id), name: String(c.name || '新消息') })).slice(0, 100);
  await ref.update({
    token,
    enabled: true,
    autoMsg: Boolean(autoMsg),
    contacts: roster,
    updatedAt: Date.now(),
    disabledAt: null,
    nextPushAt: Number(current.nextPushAt) > Date.now() ? Number(current.nextPushAt) : Date.now() + 45 * 60000
  });
  return true;
}

async function disablePushDevice() {
  try {
    const user = await ensureFirebaseAuth();
    await _fbDb.ref(`push_devices/${user.uid}`).update({ enabled: false, updatedAt: Date.now() });
    return true;
  } catch (e) {
    console.warn('关闭后台推送失败', e);
    return false;
  }
}

async function getPendingPushMessages() {
  try {
    const user = await ensureFirebaseAuth();
    const snapshot = await _fbDb.ref(`push_devices/${user.uid}/pending`).once('value');
    const value = snapshot.val() || {};
    return Object.entries(value).map(([id, item]) => ({ id, ...item })).sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
  } catch (e) {
    console.warn('读取后台主动消息失败', e);
    return [];
  }
}

async function acknowledgePendingPushMessage(id) {
  if (!id) return;
  const user = await ensureFirebaseAuth();
  await _fbDb.ref(`push_devices/${user.uid}/pending/${id}`).remove();
}

function sanitizeRoomId(roomId) {
  return String(roomId).replace(/[.#$\[\]\/]/g, '_');
}

function mergeCloudChats(remoteChats = {}, localChats = {}) {
  const merged = { ...(remoteChats || {}) };
  for (const [chatId, localMessages] of Object.entries(localChats || {})) {
    const byId = new Map();
    for (const message of [...(merged[chatId] || []), ...(localMessages || [])]) {
      const key = String(message?.id ?? `${message?.ts || ''}:${message?.from || ''}:${message?.text || ''}`);
      const existing = byId.get(key);
      if (!existing) { byId.set(key, message); continue; }
      // Deletion tombstones always win, otherwise the most recently edited copy wins.
      if (existing.deletedAt || message?.deletedAt) {
        byId.set(key, Number(existing.deletedAt || 0) >= Number(message?.deletedAt || 0) ? existing : message);
      } else {
        const existingRev = Number(existing.modifiedAt || existing.ts || 0);
        const messageRev = Number(message?.modifiedAt || message?.ts || 0);
        byId.set(key, messageRev >= existingRev ? { ...existing, ...message } : { ...message, ...existing });
      }
    }
    merged[chatId] = [...byId.values()].sort((a, b) => Number(a?.ts || a?.id || 0) - Number(b?.ts || b?.id || 0));
  }
  return merged;
}
function mergeCloudItems(remoteItems = [], localItems = []) {
  const byId = new Map();
  for (const item of [...(remoteItems || []), ...(localItems || [])]) byId.set(String(item?.id ?? JSON.stringify(item)), item);
  return [...byId.values()];
}

async function cloudUpload(fullDataObj) {
  const cfg = getCloudConfig();
  if (!cfg.enabled || !cfg.roomId) return false;
  const db = initFirebase();
  if (!db) return false;
  try {
    await ensureFirebaseAuth();
    const key = sanitizeRoomId(cfg.roomId);
    let receipt = null;
    await db.ref('tarot_rooms/' + key).transaction(current => {
      let remote = {};
      try {
        remote = typeof current?.data === 'string' ? JSON.parse(current.data) : (current?.data || {});
      } catch (_) {}
      const merged = {
        ...remote, ...fullDataObj,
        contacts: mergeCloudItems(remote.contacts, fullDataObj.contacts),
        groups: mergeCloudItems(remote.groups, fullDataObj.groups),
        moments: mergeCloudItems(remote.moments, fullDataObj.moments),
        avatarLibrary: mergeCloudItems(remote.avatarLibrary, fullDataObj.avatarLibrary),
        chats: mergeCloudChats(remote.chats, fullDataObj.chats)
      };
      // Store structured data. The legacy JSON string hit Firebase's per-string size limit
      // once avatars, stickers, and image messages accumulated.
      const cleanData = JSON.parse(JSON.stringify(merged));
      receipt = { fingerprint: cloudFingerprint(cleanData), updatedAt: Date.now() };
      return { schemaVersion: 2, data: cleanData, fingerprint: receipt.fingerprint, updatedAt: firebase.database.ServerValue.TIMESTAMP };
    });
    window.__lastCloudReceipt = receipt;
    window.__lastCloudError = '';
    return true;
  } catch (e) { window.__lastCloudError = e?.message || String(e); console.error('云端上传失败', e); return false; }
}

async function cloudDownload() {
  const cfg = getCloudConfig();
  if (!cfg.enabled || !cfg.roomId) return null;
  const db = initFirebase();
  if (!db) return null;
  try {
    await ensureFirebaseAuth();
    const key = sanitizeRoomId(cfg.roomId);
    const snapshot = await db.ref('tarot_rooms/' + key).once('value');
    const val = snapshot.val();
    if (!val || !val.data) { window.__lastCloudError = '云端还没有资料'; return null; }
    window.__lastCloudError = '';
    const data = typeof val.data === 'string' ? JSON.parse(val.data) : val.data;
    window.__lastCloudDownloadMeta = {
      schemaVersion: Number(val.schemaVersion || 1),
      updatedAt: Number(val.updatedAt || 0),
      fingerprint: val.fingerprint || cloudFingerprint(data),
      calculatedFingerprint: cloudFingerprint(data)
    };
    return data;
  } catch (e) { window.__lastCloudError = e?.message || String(e); console.error('云端下载失败', e); return null; }
}
