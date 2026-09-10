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

async function cloudUpload(fullDataObj) {
  const cfg = getCloudConfig();
  if (!cfg.enabled || !cfg.roomId) return false;
  const db = initFirebase();
  if (!db) return false;
  try {
    await ensureFirebaseAuth();
    const key = sanitizeRoomId(cfg.roomId);
    await db.ref('tarot_rooms/' + key).set({
      data: JSON.stringify(fullDataObj),
      updatedAt: Date.now()
    });
    return true;
  } catch (e) { console.error('云端上传失败', e); return false; }
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
    if (!val || !val.data) return null;
    return JSON.parse(val.data);
  } catch (e) { console.error('云端下载失败', e); return null; }
}
