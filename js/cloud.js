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

let _fbApp = null, _fbDb = null;

function initFirebase() {
  try {
    if (!_fbApp) {
      _fbApp = firebase.initializeApp(FIREBASE_CONFIG);
      _fbDb = firebase.database();
    }
    return _fbDb;
  } catch (e) {
    console.error('Firebase 初始化失败', e);
    return null;
  }
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
    const key = sanitizeRoomId(cfg.roomId);
    const snapshot = await db.ref('tarot_rooms/' + key).once('value');
    const val = snapshot.val();
    if (!val || !val.data) return null;
    return JSON.parse(val.data);
  } catch (e) { console.error('云端下载失败', e); return null; }
}