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
  for (const item of [...(remoteItems || []), ...(localItems || [])]) {
    const key = String(item?.id ?? JSON.stringify(item));
    const old = byId.get(key);
    if (!old) { byId.set(key, item); continue; }
    const oldRev = Number(old.updatedAt || old.modifiedAt || old.ts || old.createdAt || 0);
    const newRev = Number(item?.updatedAt || item?.modifiedAt || item?.ts || item?.createdAt || 0);
    byId.set(key, newRev >= oldRev ? { ...old, ...item } : { ...item, ...old });
  }
  return [...byId.values()];
}

const CLOUD_V3_ROOT = 'tarot_rooms_v3';
const CLOUD_CHUNK_TARGET = 480000;
let _cloudUploadRunning = null;
let _cloudUploadPending = null;

function cleanCloudData(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}
function cloudChatKey(chatId) {
  return encodeURIComponent(String(chatId)).replace(/\./g, '%2E');
}
async function writeCloudValue(ref, value) {
  const json = JSON.stringify(cleanCloudData(value));
  const parts = [];
  for (let i = 0; i < json.length; i += CLOUD_CHUNK_TARGET) parts.push(json.slice(i, i + CLOUD_CHUNK_TARGET));
  if (!parts.length) parts.push('null');
  await ref.child('meta').set({ format: 'json-parts', parts: parts.length, length: json.length });
  for (let i = 0; i < parts.length; i++) {
    await ref.child(`chunks/${String(i).padStart(5, '0')}`).set(parts[i]);
  }
}
function readCloudValue(node, fallback = null) {
  if (!node) return fallback;
  const chunks = node.chunks || {};
  if (node.meta?.format === 'json-parts') {
    try { return JSON.parse(Object.keys(chunks).sort().map(key => chunks[key] || '').join('')); }
    catch (_) { return fallback; }
  }
  const oldArray = Object.keys(chunks).sort().flatMap(key => Array.isArray(chunks[key]) ? chunks[key] : []);
  return oldArray.length ? oldArray : fallback;
}
async function writeCloudArray(ref, items) {
  await writeCloudValue(ref, items || []);
}
function readCloudArray(node) {
  const value = readCloudValue(node, []);
  return Array.isArray(value) ? value : [];
}
async function writeCloudGeneration(ref, data, receipt) {
  const core = { ...data };
  delete core.chats;
  delete core.moments;
  delete core.privateBlog;
  delete core.avatarLibrary;
  delete core.stickers;
  await writeCloudValue(ref.child('core'), core);
  await writeCloudArray(ref.child('collections/moments'), data.moments || []);
  await writeCloudArray(ref.child('collections/privateBlog'), data.privateBlog || []);
  await writeCloudArray(ref.child('collections/avatarLibrary'), data.avatarLibrary || []);
  await writeCloudArray(ref.child('collections/stickers'), data.stickers || []);
  for (const [chatId, messages] of Object.entries(data.chats || {})) {
    const chatRef = ref.child(`chats/${cloudChatKey(chatId)}`);
    await chatRef.child('id').set(String(chatId));
    await writeCloudArray(chatRef, messages || []);
  }
  await ref.child('manifest').set({
    schemaVersion: 3,
    fingerprint: receipt.fingerprint,
    updatedAt: firebase.database.ServerValue.TIMESTAMP
  });
}
function readCloudGeneration(value) {
  if (!value?.manifest || !value?.core) return null;
  const core = readCloudValue(value.core, value.core || {});
  const data = {
    ...(core || {}),
    moments: readCloudArray(value.collections?.moments),
    privateBlog: readCloudArray(value.collections?.privateBlog),
    avatarLibrary: readCloudArray(value.collections?.avatarLibrary),
    stickers: readCloudArray(value.collections?.stickers),
    chats: {}
  };
  for (const chat of Object.values(value.chats || {})) {
    if (chat?.id == null) continue;
    data.chats[String(chat.id)] = readCloudArray(chat);
  }
  return { data, manifest: value.manifest };
}
async function downloadCloudRoom(key) {
  const v3Root = _fbDb.ref(`${CLOUD_V3_ROOT}/${key}`);
  const current = (await v3Root.child('current').once('value')).val();
  if (current) {
    const generation = (await v3Root.child(`generations/${current}`).once('value')).val();
    const parsed = readCloudGeneration(generation);
    if (parsed) return { ...parsed, schemaVersion: 3 };
  }
  const legacy = (await _fbDb.ref('tarot_rooms/' + key).once('value')).val();
  if (!legacy?.data) return null;
  const data = typeof legacy.data === 'string' ? JSON.parse(legacy.data) : legacy.data;
  return {
    data,
    schemaVersion: Number(legacy.schemaVersion || 1),
    manifest: { updatedAt: Number(legacy.updatedAt || 0), fingerprint: legacy.fingerprint || cloudFingerprint(data) }
  };
}
function mergeCloudPayload(remote = {}, local = {}) {
  return {
    ...remote, ...local,
    contacts: mergeCloudItems(remote.contacts, local.contacts),
    groups: mergeCloudItems(remote.groups, local.groups),
    moments: mergeCloudItems(remote.moments, local.moments),
    privateBlog: mergeCloudItems(remote.privateBlog, local.privateBlog),
    avatarLibrary: mergeCloudItems(remote.avatarLibrary, local.avatarLibrary),
    stickers: mergeCloudItems(remote.stickers, local.stickers),
    chats: mergeCloudChats(remote.chats, local.chats)
  };
}

async function cloudUploadNow(fullDataObj) {
  const cfg = getCloudConfig();
  if (!cfg.enabled || !cfg.roomId) return false;
  const db = initFirebase();
  if (!db) return false;
  try {
    await ensureFirebaseAuth();
    const key = sanitizeRoomId(cfg.roomId);
    const existing = await downloadCloudRoom(key);
    const cleanData = cleanCloudData(mergeCloudPayload(existing?.data || {}, fullDataObj || {}));
    const receipt = { fingerprint: cloudFingerprint(cleanData), updatedAt: Date.now() };
    const generationId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const root = db.ref(`${CLOUD_V3_ROOT}/${key}`);
    await writeCloudGeneration(root.child(`generations/${generationId}`), cleanData, receipt);
    await root.update({
      current: generationId,
      schemaVersion: 3,
      fingerprint: receipt.fingerprint,
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    });
    root.child('generations').once('value').then(snapshot => {
      const generations = snapshot.val() || {};
      return Promise.all(Object.keys(generations)
        .filter(id => id !== generationId)
        .map(id => root.child(`generations/${id}`).remove()));
    }).catch(() => {});
    window.__lastCloudReceipt = receipt;
    window.__lastCloudError = '';
    return true;
  } catch (e) { window.__lastCloudError = e?.message || String(e); console.error('云端上传失败', e); return false; }
}

async function cloudUpload(fullDataObj) {
  _cloudUploadPending = fullDataObj;
  if (_cloudUploadRunning) return _cloudUploadRunning;
  _cloudUploadRunning = (async () => {
    let ok = true;
    while (_cloudUploadPending) {
      const next = _cloudUploadPending;
      _cloudUploadPending = null;
      ok = await cloudUploadNow(next);
      if (!ok) _cloudUploadPending = null;
    }
    return ok;
  })();
  try { return await _cloudUploadRunning; }
  finally { _cloudUploadRunning = null; }
}

async function cloudDownload() {
  const cfg = getCloudConfig();
  if (!cfg.enabled || !cfg.roomId) return null;
  const db = initFirebase();
  if (!db) return null;
  try {
    await ensureFirebaseAuth();
    const key = sanitizeRoomId(cfg.roomId);
    const room = await downloadCloudRoom(key);
    if (!room?.data) { window.__lastCloudError = '云端还没有资料'; return null; }
    window.__lastCloudError = '';
    const data = room.data;
    window.__lastCloudDownloadMeta = {
      schemaVersion: Number(room.schemaVersion || 1),
      updatedAt: Number(room.manifest?.updatedAt || 0),
      fingerprint: room.manifest?.fingerprint || cloudFingerprint(data),
      calculatedFingerprint: cloudFingerprint(data)
    };
    return data;
  } catch (e) { window.__lastCloudError = e?.message || String(e); console.error('云端下载失败', e); return null; }
}
