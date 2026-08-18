/* ============ 全局报错捕获 ============ */
(function setupErrorBanner() {
  function createBanner() {
    if (document.getElementById('debugErrorBanner')) return;
    const banner = document.createElement('div');
    banner.id = 'debugErrorBanner';
    banner.style.cssText = 'display:none;position:fixed;top:0;left:0;right:0;z-index:99999;background:#fa5151;color:#fff;font-size:12px;padding:10px;max-height:40vh;overflow-y:auto;white-space:pre-wrap;word-break:break-word;';
    document.body.appendChild(banner);
    return banner;
  }
  function showError(msg) {
    const banner = createBanner();
    if (!banner) return;
    banner.style.display = 'block';
    banner.textContent = '⚠️ 页面出错了：\n' + msg;
  }
  window.addEventListener('DOMContentLoaded', createBanner);
  window.addEventListener('error', e => showError((e.message || '未知错误') + '\n' + (e.filename || '') + ':' + (e.lineno || '')));
  window.addEventListener('unhandledrejection', e => showError('Promise错误: ' + (e.reason?.message || JSON.stringify(e.reason))));
  window.addEventListener('DOMContentLoaded', () => {
    try {
      const marker = sessionStorage.getItem('__pending_op__');
      if (marker) {
        setTimeout(() => showError(`上次操作（${marker}）进行到一半时页面被重新加载了，很可能是系统内存不足自动刷新造成的。`), 800);
        sessionStorage.removeItem('__pending_op__');
      }
    } catch(e) {}
  });
})();
function markOpStart(name) { try { sessionStorage.setItem('__pending_op__', name); } catch(e) {} }
function markOpDone() { try { sessionStorage.removeItem('__pending_op__'); } catch(e) {} }

/* ============ 全局：JS层面拦截长按选取/系统菜单 ============ */
(function preventNativeLongPressMenus() {
  document.addEventListener('touchstart', function(e) {
    if (e.target.closest('input, textarea')) return;
  }, { passive: true });
  document.addEventListener('contextmenu', function(e) {
    if (e.target.closest('input, textarea')) return;
    e.preventDefault();
  });
  setInterval(() => {
    try {
      const sel = window.getSelection();
      if (sel && sel.toString().length > 0) {
        const active = document.activeElement;
        if (!active || (active.tagName !== 'INPUT' && active.tagName !== 'TEXTAREA')) sel.removeAllRanges();
      }
    } catch(e) {}
  }, 400);
})();

/* ============ 安全存储 ============ */
function safeLoadJSON(key, def) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return def;
    const parsed = JSON.parse(raw);
    return (parsed === null || parsed === undefined) ? def : parsed;
  } catch (e) { console.error(`读取[${key}]失败`, e); try { localStorage.removeItem(key); } catch(_) {} return def; }
}
function safeSaveJSON(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { console.error(e); } }
function safeGetItem(key, def = null) { try { const v = localStorage.getItem(key); return v === null ? def : v; } catch (e) { return def; } }
function safeSetItem(key, val) { try { localStorage.setItem(key, val); } catch (e) { console.error(e); } }

/* ============ 状态 ============ */
const STORE = {
  contacts: 'tarot_contacts_v2', groups: 'tarot_groups_v1', chats: 'tarot_chats_v2',
  moments: 'tarot_moments_v1', avatarLib: 'tarot_avatarlib_v1', myAvatar: 'tarot_my_avatar_v1',
  myName: 'tarot_my_name_v1', chatBg: 'tarot_chat_bg_v1', momentsCover: 'tarot_moments_cover_v1',
  unread: 'tarot_unread_v1'
};
const STICKER_KEY = 'tarot_stickers_v1';
const WALLET_KEY = 'tarot_wallet_v1';
const PINNED_CHATS_KEY = 'tarot_pinned_chats_v1';
const AD_DAILY_KEY = 'tarot_ad_daily_v1';
const TEA_ADDRESS_KEY = 'tarot_tea_address_v1';

function getStickers() { return safeLoadJSON(STICKER_KEY, []); }
function saveStickers(list) { safeSaveJSON(STICKER_KEY, list); }
function getWallet() {
  const w = safeLoadJSON(WALLET_KEY, { balance: 9999, transactions: [], rechargeToday: { date:'', amount:0 } });
  if (!(w.balance >= 0)) { w.balance = 0; saveWallet(w); }
  return w;
}
function saveWallet(w) { safeSaveJSON(WALLET_KEY, w); }
function getPinnedChats() { return safeLoadJSON(PINNED_CHATS_KEY, []); }
function savePinnedChats(list) { safeSaveJSON(PINNED_CHATS_KEY, list); }
function isChatPinned(chatId) { return getPinnedChats().includes(String(chatId)); }
function toggleChatPinned(chatId) {
  const list = getPinnedChats();
  const idx = list.indexOf(String(chatId));
  if (idx >= 0) list.splice(idx, 1);
  else list.unshift(String(chatId));
  savePinnedChats(list);
}
function getAdDailyState() { return safeLoadJSON(AD_DAILY_KEY, { date:'', count:0 }); }
function saveAdDailyState(s) { safeSaveJSON(AD_DAILY_KEY, s); }

const state = {
  contacts: safeLoadJSON(STORE.contacts, []),
  groups: safeLoadJSON(STORE.groups, []),
  chats: safeLoadJSON(STORE.chats, {}),
  moments: safeLoadJSON(STORE.moments, []),
  avatarLibrary: safeLoadJSON(STORE.avatarLib, []),
  myAvatar: safeGetItem(STORE.myAvatar, null) || null,
  myName: safeGetItem(STORE.myName, '我') || '我',
  chatBg: safeGetItem(STORE.chatBg, null) || null,
  momentsCover: safeGetItem(STORE.momentsCover, null) || null,
  unread: safeLoadJSON(STORE.unread, {}),
  activeChatId: null,
  pendingBatch: {},
  batchTimer: {}
};

let _cloudSyncTimer = null;
function persist() {
  safeSaveJSON(STORE.contacts, state.contacts);
  safeSaveJSON(STORE.groups, state.groups);
  safeSaveJSON(STORE.chats, state.chats);
  safeSaveJSON(STORE.moments, state.moments);
  safeSaveJSON(STORE.avatarLib, state.avatarLibrary);
  safeSetItem(STORE.myAvatar, state.myAvatar || '');
  safeSetItem(STORE.myName, state.myName || '我');
  safeSetItem(STORE.chatBg, state.chatBg || '');
  safeSetItem(STORE.momentsCover, state.momentsCover || '');
  safeSaveJSON(STORE.unread, state.unread);

  clearTimeout(_cloudSyncTimer);
  _cloudSyncTimer = setTimeout(() => {
    const cfg = getCloudConfig();
    if (cfg.enabled) {
      cloudUpload({
        contacts: state.contacts, groups: state.groups, chats: state.chats, moments: state.moments,
        avatarLibrary: state.avatarLibrary, myAvatar: state.myAvatar, myName: state.myName,
        chatBg: state.chatBg, momentsCover: state.momentsCover,
        wordCards: WordCards.getAll(), stickers: getStickers()
      });
    }
  }, 2000);
}

async function tryCloudLoadOnStartup() {
  const cfg = getCloudConfig();
  if (!cfg.enabled) return;
  const cloudData = await cloudDownload();
  if (!cloudData) return;
  if (cloudData.contacts) state.contacts = cloudData.contacts;
  if (cloudData.groups) state.groups = cloudData.groups;
  if (cloudData.chats) state.chats = cloudData.chats;
  if (cloudData.moments) state.moments = cloudData.moments;
  if (cloudData.avatarLibrary) state.avatarLibrary = cloudData.avatarLibrary;
  if (cloudData.myAvatar) state.myAvatar = cloudData.myAvatar;
  if (cloudData.myName) state.myName = cloudData.myName;
  if (cloudData.chatBg) state.chatBg = cloudData.chatBg;
  if (cloudData.momentsCover) state.momentsCover = cloudData.momentsCover;
  if (cloudData.wordCards) WordCards.save(cloudData.wordCards);
  if (cloudData.stickers) saveStickers(cloudData.stickers);
  safeSaveJSON(STORE.contacts, state.contacts);
  safeSaveJSON(STORE.groups, state.groups);
  safeSaveJSON(STORE.chats, state.chats);
  safeSaveJSON(STORE.moments, state.moments);
  safeSaveJSON(STORE.avatarLib, state.avatarLibrary);
  safeSetItem(STORE.myAvatar, state.myAvatar || '');
  safeSetItem(STORE.myName, state.myName || '');
  safeSetItem(STORE.chatBg, state.chatBg || '');
  safeSetItem(STORE.momentsCover, state.momentsCover || '');
}

function hashColor(str) {
  let h = 0; const s = String(str || '');
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${Math.abs(h) % 360},55%,55%)`;
}
function hashColorDark(str) {
  let h = 0; const s = String(str || '');
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${Math.abs(h) % 360},50%,32%)`;
}
function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function getContactById(id) { return state.contacts.find(c => String(c.id) === String(id)); }
function getGroupById(id) { return state.groups.find(g => String(g.id) === String(id)); }
function isGroupChat(chatId) { return typeof chatId === 'string' && chatId.startsWith('g_'); }
function avatarHtml(dataUrl, name, size = 40) {
  if (dataUrl) return `<div class="avatar img" style="width:${size}px;height:${size}px;background-image:url('${dataUrl}')"></div>`;
  return `<div class="avatar" style="width:${size}px;height:${size}px;background:${hashColor(name)}">${escapeHtml(name || '?').slice(0,1)}</div>`;
}
function resizeImageDataUrl(dataUrl, maxDim = 240, quality = 0.82) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      try { resolve(canvas.toDataURL('image/jpeg', quality)); }
      catch (e) { resolve(dataUrl); }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
function readImageFileCompressed(file, maxDim = 240, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = ev => resizeImageDataUrl(ev.target.result, maxDim, quality).then(resolve);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function formatMomentDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日 ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function formatMomentFeedTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  const d = new Date(ts), now = new Date();
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  const hm = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  if (d.toDateString() === yest.toDateString()) return `昨天 ${hm}`;
  return d.getFullYear() === now.getFullYear() ? `${d.getMonth()+1}月${d.getDate()}日` : `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
}

/* ============ 灵动岛 Face ID 模拟动画 ============ */
function runFaceIdSimulation(onSuccess) {
  const island = document.getElementById('dynIsland');
  const label = document.getElementById('dynLabel');
  if (!island) { onSuccess(); return; }
  island.classList.remove('hidden-island', 'success');
  if (label) label.textContent = 'Face ID';
  requestAnimationFrame(() => { island.classList.add('expanded'); });
  setTimeout(() => {
    island.classList.add('success');
    if (label) label.textContent = '已验证';
    setTimeout(() => {
      island.classList.remove('expanded');
      setTimeout(() => { island.classList.add('hidden-island'); island.classList.remove('success'); }, 400);
      onSuccess();
    }, 700);
  }, 1400);
}

/* ============ 朋友圈/广告消息：纯AI自由文本生成（不使用字卡） ============ */
const MOMENT_FALLBACK_PHRASES = ["今天心情不错～","想找人聊聊","忙里偷闲的一天","有点想你们了","日子过得很快呀","今天也要加油","晴朗的一天，心情也跟着好起来","有些事想不明白，但也不纠结了","偶尔emo一下，很快就好","生活总有惊喜"];
const AD_FALLBACK_TEMPLATES = ["限时惊喜，戳我了解详情～","新品上架，要不要一起试试？","今天有个小活动，别错过啦","突然想起有个好东西要推荐给你"];

async function generateFreeformMomentText(cards, persona, context) {
  const cardDesc = (cards || []).map(c => `${c.name}(${c.reversed?'逆位':'正位'}):${c.meaning}`).join('; ');
  const sys = `你正在扮演角色:"${persona || '一个真实的人'}"。请结合塔罗牌意，写一句自然、简短、像真人一样的中文句子（不超过40字，不要加引号，不要解释塔罗牌，只输出最终句子本身，不要输出任何多余文字）。`;
  const result = await callLLM(sys, `场景: ${context}\n抽到的塔罗牌: ${cardDesc}`);
  if (result && result.trim()) {
    return result.trim().replace(/^["""'']+|["""'']+$/g, '');
  }
  return MOMENT_FALLBACK_PHRASES[secureRandomInt(MOMENT_FALLBACK_PHRASES.length)];
}

/* ============ 导航 ============ */
let navStack = ['page-chatlist'];
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => { p.classList.add('hidden'); p.style.transform=''; p.style.transition=''; p.style.zIndex=''; });
  document.getElementById(id)?.classList.remove('hidden');
}
function setActiveTab(tabName) { document.querySelectorAll('.tab-item').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName)); }
function switchTab(tabName, pageId) { navStack = [pageId]; showPage(pageId); setActiveTab(tabName); }
function pushPage(id) {
  const next = document.getElementById(id);
  if (!next) return;
  next.classList.remove('hidden');
  next.style.zIndex = 50;
  next.style.transition = 'none';
  next.style.transform = 'translateX(100%)';
  void next.offsetWidth;
  requestAnimationFrame(() => { next.style.transition = 'transform 0.3s cubic-bezier(.25,.46,.45,.94)'; next.style.transform = 'translateX(0)'; });
  navStack.push(id);
}
function popPage() {
  if (navStack.length <= 1) return;
  const topId = navStack.pop();
  if (topId === 'page-chat') { state.activeChatId = null; renderChatList(); }
  const top = document.getElementById(topId);
  if (!top) return;
  top.style.transition = 'transform 0.28s cubic-bezier(.25,.46,.45,.94)';
  top.style.transform = 'translateX(100%)';
  setTimeout(() => { top.classList.add('hidden'); top.style.transform=''; top.style.transition=''; top.style.zIndex=''; }, 280);
}
function bindSwipeBack() {
  const appEl = document.getElementById('app');
  if (!appEl) return;
  let startX = 0, startY = 0, dragging = false, topEl = null, poppedId = null;
  appEl.addEventListener('touchstart', e => {
    if (navStack.length <= 1) return;
    const t = e.touches[0];
    if (t.clientX > 40) return;
    startX = t.clientX; startY = t.clientY; dragging = true;
    poppedId = navStack[navStack.length - 1];
    topEl = document.getElementById(poppedId);
    if (topEl) topEl.style.transition = 'none';
  }, { passive: true });
  appEl.addEventListener('touchmove', e => {
    if (!dragging || !topEl) return;
    const t = e.touches[0];
    const dx = t.clientX - startX, dy = t.clientY - startY;
    if (Math.abs(dy) > Math.abs(dx) + 10) { dragging = false; topEl.style.transform = ''; return; }
    if (dx > 0) topEl.style.transform = `translateX(${dx}px)`;
  }, { passive: true });
  appEl.addEventListener('touchend', () => {
    if (!dragging || !topEl) { dragging = false; return; }
    dragging = false;
    const m = /translateX\(([\d.]+)px\)/.exec(topEl.style.transform || '');
    const dx = m ? parseFloat(m[1]) : 0;
    topEl.style.transition = 'transform 0.25s ease';
    if (dx > 80) {
      const w = appEl.clientWidth;
      topEl.style.transform = `translateX(${w}px)`;
      navStack.pop();
      if (poppedId === 'page-chat') { state.activeChatId = null; renderChatList(); }
      const el = topEl;
      setTimeout(() => { el.classList.add('hidden'); el.style.transform=''; el.style.transition=''; el.style.zIndex=''; }, 250);
    } else topEl.style.transform = 'translateX(0)';
    topEl = null;
  });
}

const TAB_ITEMS = [
  {tab:'chat', label:'WeChat', page:'page-chatlist', icon:'<path d="M4 4h16v12H8l-4 4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>'},
  {tab:'contacts', label:'通讯录', page:'page-contacts', icon:'<circle cx="12" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5 20c1-4 4-6 7-6s6 2 7 6" fill="none" stroke="currentColor" stroke-width="1.6"/>'},
  {tab:'discover', label:'发现', page:'page-discover', icon:'<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M15 9l-2 6-6 2 2-6z" fill="currentColor"/>'},
  {tab:'me', label:'我', page:'page-me', icon:'<circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4 21c1.5-5 5-7 8-7s6.5 2 8 7" fill="none" stroke="currentColor" stroke-width="1.6"/>'}
];
function renderTabBars() {
  document.querySelectorAll('[data-tabbar]').forEach(bar => {
    bar.innerHTML = TAB_ITEMS.map(t => `<div class="tab-item" data-tab="${t.tab}" data-page="${t.page}"><svg class="tab-icon" viewBox="0 0 24 24">${t.icon}</svg><span>${t.label}</span></div>`).join('');
  });
  document.querySelectorAll('.tab-item').forEach(el => el.addEventListener('click', () => switchTab(el.dataset.tab, el.dataset.page)));
  setActiveTab('chat');
}

/* ============ 我 页面 ============ */
function renderMePage() {
  const nameEl = document.getElementById('pnameText');
  if (nameEl) nameEl.textContent = state.myName || '我';
  const el = document.getElementById('meAvatar');
  if (!el) return;
  el.outerHTML = avatarHtml(state.myAvatar, state.myName || '我', 64).replace('class="avatar', 'id="meAvatar" class="avatar');
  const newEl = document.getElementById('meAvatar');
  if (newEl) newEl.addEventListener('click', () => document.getElementById('myAvatarFileInput')?.click());
}
function bindEditName() {
  document.getElementById('editNameBtn')?.addEventListener('click', () => {
    document.getElementById('editNameInput').value = state.myName;
    document.getElementById('editNameSheet').classList.remove('hidden');
  });
  document.getElementById('editNameCancel')?.addEventListener('click', () => document.getElementById('editNameSheet').classList.add('hidden'));
  document.getElementById('editNameConfirm')?.addEventListener('click', () => {
    const v = document.getElementById('editNameInput').value.trim();
    if (v) { state.myName = v; persist(); renderMePage(); renderMomentsProfile(); }
    document.getElementById('editNameSheet').classList.add('hidden');
  });
}

/* ============ 聊天背景 ============ */
function applyChatBackground() {
  const box = document.getElementById('msgList');
  if (!box) return;
  box.style.backgroundImage = state.chatBg ? `url('${state.chatBg}')` : '';
}
function bindChatBackground() {
  document.getElementById('rowChatBg')?.addEventListener('click', () => document.getElementById('chatBgFileInput')?.click());
  document.getElementById('chatBgFileInput')?.addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { state.chatBg = ev.target.result; persist(); applyChatBackground(); alert('背景已更新'); };
    reader.readAsDataURL(file);
    e.target.value = '';
  });
  document.getElementById('rowChatBgClear')?.addEventListener('click', () => { state.chatBg = null; persist(); applyChatBackground(); alert('已恢复默认背景'); });
}

/* ============ 朋友圈封面 + 头像 + 名字 ============ */
function renderMomentsProfile() {
  const coverEl = document.getElementById('momentsCoverImg');
  if (coverEl) coverEl.style.backgroundImage = state.momentsCover ? `url('${state.momentsCover}')` : '';
  const nameEl = document.getElementById('momentsMyName');
  if (nameEl) nameEl.textContent = state.myName || '我';
  const avatarEl = document.getElementById('momentsMyAvatar');
  if (avatarEl) {
    avatarEl.style.backgroundImage = state.myAvatar ? `url('${state.myAvatar}')` : '';
    avatarEl.style.backgroundColor = state.myAvatar ? 'transparent' : hashColor(state.myName || '我');
    avatarEl.style.backgroundSize = 'cover'; avatarEl.style.backgroundPosition = 'center';
    if (!state.myAvatar) {
      avatarEl.textContent = (state.myName || '我').slice(0,1);
      avatarEl.style.display = 'flex'; avatarEl.style.alignItems = 'center'; avatarEl.style.justifyContent = 'center';
      avatarEl.style.color = '#fff'; avatarEl.style.fontSize = '22px'; avatarEl.style.fontWeight = '600';
    } else avatarEl.textContent = '';
  }
}
function bindMomentsProfile() {
  document.getElementById('momentsCoverImg')?.addEventListener('click', () => document.getElementById('momentsCoverFileInput')?.click());
  document.getElementById('momentsCoverFileInput')?.addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { state.momentsCover = ev.target.result; persist(); renderMomentsProfile(); };
    reader.readAsDataURL(file);
    e.target.value = '';
  });
  document.getElementById('momentsMyAvatar')?.addEventListener('click', () => { popPage(); setTimeout(() => switchTab('me', 'page-me'), 0); });
}
function bindDiscoverPlaceholders() {
  document.getElementById('rowScan')?.addEventListener('click', () => alert('扫一扫功能暂未开放'));
  document.getElementById('rowChannels')?.addEventListener('click', () => alert('视频号功能暂未开放'));
}

/* ============ 未读消息统计 & 顶部标题更新 ============ */
function totalUnreadCount() {
  return Object.values(state.unread || {}).reduce((sum, n) => sum + (n || 0), 0);
}
function updateChatListNavTitle() {
  const el = document.getElementById('chatListNavTitle');
  if (!el) return;
  const total = totalUnreadCount();
  el.textContent = total > 0 ? `WeChat (${total > 99 ? '99+' : total})` : 'WeChat';
}

/* ============ 聊天列表 / 通讯录（含置顶排序 + 未读徽标） ============ */
function renderChatList() {
  const box = document.getElementById('chatListItems');
  if (!box) return;
  const pinned = getPinnedChats();
  const items = [
    ...state.contacts.map(c => ({ id: String(c.id), name: c.name, avatar: c.avatar })),
    ...state.groups.map(g => ({ id: 'g_' + g.id, name: g.name, avatar: null }))
  ];
  items.sort((a, b) => {
    const ap = pinned.indexOf(a.id), bp = pinned.indexOf(b.id);
    if (ap >= 0 && bp >= 0) return ap - bp;
    if (ap >= 0) return -1;
    if (bp >= 0) return 1;
    return 0;
  });
  if (!items.length) { box.innerHTML = `<div style="padding:40px 20px;text-align:center;color:#999;font-size:14px;">还没有角色，点右上角 + 添加一个吧</div>`; updateChatListNavTitle(); return; }
  box.innerHTML = items.map(it => {
    const msgs = state.chats[it.id] || [];
    const last = msgs[msgs.length - 1];
    let lastText = '开始一段对话...';
    if (last) {
      if (last.type === 'redpacket') lastText = '[红包]';
      else if (last.type === 'options') lastText = '[选项]';
      else if (last.type === 'image') lastText = '[图片]';
      else if (last.type === 'location') lastText = '[位置]';
      else if (last.type === 'call') lastText = `[${last.callType === 'video' ? '视频通话' : '语音通话'}]`;
      else lastText = escapeHtml(last.text);
    }
    const isPinned = pinned.includes(it.id);
    const unreadN = state.unread[it.id] || 0;
    const pinTag = isPinned ? `<span class="pin-badge"><svg viewBox="0 0 24 24"><path d="M12 2l3 6 6 1-4.5 4.5 1 6.5-5.5-3-5.5 3 1-6.5L3 9l6-1z" fill="#999"/></svg>置顶</span>` : (last ? new Date(last.ts).toLocaleTimeString().slice(0,5) : '');
    return `<div class="chat-item ${isPinned ? 'pinned' : ''}" data-id="${it.id}">
      <div class="avatar-wrap">${avatarHtml(it.avatar, it.name, 50)}${unreadN>0 ? `<span class="unread-badge">${unreadN>99?'99+':unreadN}</span>` : ''}</div>
      <div class="info">
        <div class="row1"><span class="name">${escapeHtml(it.name)}</span><span class="time">${pinTag}</span></div>
        <div class="last-msg">${lastText}</div>
      </div></div>`;
  }).join('');
  updateChatListNavTitle();
}
function renderContactList() {
  const box = document.getElementById('contactListItems');
  if (!box) return;
  if (!state.contacts.length) { box.innerHTML = `<div style="padding:40px 20px;text-align:center;color:#999;font-size:14px;">还没有角色</div>`; return; }
  box.innerHTML = state.contacts.map(c => `<div class="contact-item" data-id="${c.id}">${avatarHtml(c.avatar, c.name, 50)}<div class="info"><div class="name">${escapeHtml(c.name)}</div></div></div>`).join('');
}

/* ============ 长按逻辑：聊天列表长按弹出操作菜单（置顶/删除） ============ */
let _actionSheetTargetId = null;
function bindListDelegation(containerId) {
  const box = document.getElementById(containerId);
  if (!box) return;
  let pressTimer = null;
  let startX = 0, startY = 0;
  let longPressFired = false;

  box.addEventListener('touchstart', e => {
    const item = e.target.closest('[data-id]');
    if (!item) return;
    const t = e.touches[0];
    startX = t.clientX; startY = t.clientY;
    longPressFired = false;
    pressTimer = setTimeout(() => {
      longPressFired = true;
      try { window.getSelection()?.removeAllRanges(); } catch(_) {}
      _actionSheetTargetId = item.dataset.id;
      const isGroup = isGroupChat(item.dataset.id);
      document.getElementById('chatItemPinToggle').textContent = isChatPinned(item.dataset.id) ? '取消置顶' : '置顶该聊天';
      document.getElementById('chatItemDelete').textContent = isGroup ? '删除该群聊' : '删除该聊天';
      document.getElementById('chatItemActionSheet').classList.remove('hidden');
    }, 500);
  }, { passive: true });
  box.addEventListener('touchmove', e => {
    if (!pressTimer) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - startX) > 10 || Math.abs(t.clientY - startY) > 10) { clearTimeout(pressTimer); pressTimer = null; }
  }, { passive: true });
  box.addEventListener('touchend', () => { clearTimeout(pressTimer); pressTimer = null; }, { passive: true });
  box.addEventListener('touchcancel', () => { clearTimeout(pressTimer); pressTimer = null; }, { passive: true });

  box.addEventListener('click', e => {
    if (longPressFired) { longPressFired = false; return; }
    const item = e.target.closest('[data-id]'); if (item) openChat(item.dataset.id);
  });
}
function bindChatItemActionSheet() {
  document.getElementById('chatItemActionCancel')?.addEventListener('click', () => document.getElementById('chatItemActionSheet').classList.add('hidden'));
  document.getElementById('chatItemPinToggle')?.addEventListener('click', () => {
    if (_actionSheetTargetId) toggleChatPinned(_actionSheetTargetId);
    document.getElementById('chatItemActionSheet').classList.add('hidden');
    renderChatList();
  });
  document.getElementById('chatItemDelete')?.addEventListener('click', () => {
    const id = _actionSheetTargetId;
    if (!id) return;
    if (isGroupChat(id)) {
      const g = getGroupById(id.slice(2));
      if (g && confirm(`删除群聊「${g.name}」？`)) { state.groups = state.groups.filter(x => x.id !== g.id); delete state.chats[id]; delete state.unread[id]; persist(); renderChatList(); }
    } else {
      const c = getContactById(id);
      if (c && confirm(`删除角色「${c.name}」及其聊天记录？`)) { state.contacts = state.contacts.filter(x => x.id !== c.id); delete state.chats[id]; delete state.unread[id]; persist(); renderChatList(); renderContactList(); }
    }
    document.getElementById('chatItemActionSheet').classList.add('hidden');
  });
}

/* ============ 聊天详情 ============ */
function openChat(chatId) {
  state.activeChatId = chatId;
  state.unread[chatId] = 0;
  persist();
  const name = isGroupChat(chatId) ? (getGroupById(chatId.slice(2))?.name || '群聊') : (getContactById(chatId)?.name || '角色');
  const nameEl = document.getElementById('chatPeerName');
  if (nameEl) nameEl.textContent = name;
  if (!state.chats[chatId]) state.chats[chatId] = [];
  document.getElementById('plusPanelInline')?.classList.add('hidden');
  pushPage('page-chat');
  renderMessages();
  renderChatList();
  applyChatBackground();
}

function formatMsgDividerTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const time = `${hh}:${mm}`;
  if (d.toDateString() === now.toDateString()) return time;
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return `昨天 ${time}`;
  const dayStart = x => new Date(x).setHours(0, 0, 0, 0);
  const daysDiff = Math.floor((dayStart(now) - dayStart(d)) / 86400000);
  if (daysDiff >= 0 && daysDiff < 7) return `${['周日','周一','周二','周三','周四','周五','周六'][d.getDay()]} ${time}`;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return sameYear ? `${d.getMonth() + 1}月${d.getDate()}日 ${time}` : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${time}`;
}
function renderMessages() {
  const box = document.getElementById('msgList');
  if (!box) return;
  const chatId = state.activeChatId;
  const msgs = state.chats[chatId] || [];
  const group = isGroupChat(chatId);
  let lastTs = null;

  box.innerHTML = msgs.map(m => {
    let dividerHtml = '';
    if (lastTs === null || m.ts - lastTs > 5 * 60 * 1000) dividerHtml = `<div class="msg-time-divider">${formatMsgDividerTime(m.ts)}</div>`;
    lastTs = m.ts;
    if (m.systemNote) return dividerHtml + `<div class="msg-system">${escapeHtml(m.text)}</div>`;
    const isMe = m.from === 'me';
    const senderContact = !isMe ? getContactById(m.from) : null;
    const name = isMe ? (state.myName || '我') : (senderContact?.name || '角色');
    const avatarDataUrl = isMe ? state.myAvatar : (senderContact?.avatar || null);

    let bubbleHtml;
    if (m.type === 'redpacket') {
      bubbleHtml = `<div class="bubble redpacket ${m.redpacket.status}" data-redpacket="${m.id}">
        <svg class="rp-icon" viewBox="0 0 24 24"><path d="M4 8h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" fill="none" stroke="#fff" stroke-width="1.4"/><path d="M4 8l8-4 8 4" fill="none" stroke="#fff" stroke-width="1.4"/><circle cx="12" cy="13" r="2.4" fill="none" stroke="#fff" stroke-width="1.2"/></svg>
        <div class="rp-text"><div class="rp-note">${escapeHtml(m.redpacket.note)}</div><div class="rp-sub">${m.redpacket.status === 'claimed' ? '已领取' : '微信红包'}</div></div>
      </div>`;
    } else if (m.type === 'options') {
      bubbleHtml = `<div class="bubble options">
        <div class="options-title">请选择</div>
        <div class="options-list">
          ${m.options.map((o, i) => `<div class="option-row"><span class="opt-num">${i + 1}</span>${escapeHtml(o)}</div>`).join('')}
          <div class="option-row option-other"><span class="opt-num">其他</span>不在选项中</div>
        </div>
      </div>`;
    } else if (m.type === 'image') {
      bubbleHtml = `<div class="bubble image"><img src="${m.image}" alt=""></div>`;
    } else if (m.type === 'location') {
      bubbleHtml = `<div class="bubble location" data-location="${m.id}">
        <div class="mini-map"><div class="map-pin" style="left:${m.locX}%;top:${m.locY}%;"><svg viewBox="0 0 24 24"><path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z" fill="#fa5151" stroke="#fff" stroke-width="1"/><circle cx="12" cy="9" r="2.6" fill="#fff"/></svg></div></div>
        <div class="location-text">${escapeHtml(m.text || '位置')}</div>
      </div>`;
    } else if (m.type === 'call') {
      const isVideo = m.callType === 'video';
      const hasLog = m.callChatLog && m.callChatLog.length;
      bubbleHtml = `<div class="bubble call" ${hasLog ? `data-calllog="${m.id}"` : ''}>
        <svg viewBox="0 0 24 24">${isVideo ? '<rect x="3" y="6" width="13" height="12" rx="2" fill="none" stroke="#0a0a0a" stroke-width="1.6"/><path d="M16 10l5-3v10l-5-3z" fill="none" stroke="#0a0a0a" stroke-width="1.6" stroke-linejoin="round"/>' : '<path d="M5 4c1 4 2 7 5 9s5 4 9 5l1-3c-2-1-3-2-5-3l-2 2c-2-1-4-3-5-5l2-2c-1-2-2-3-3-5z" fill="none" stroke="#0a0a0a" stroke-width="1.6" stroke-linejoin="round"/>'}</svg>
        <div class="call-bubble-text"><div>${isVideo ? '视频通话' : '语音通话'}</div><div class="call-bubble-duration">${m.callDurationText}</div></div>
      </div>`;
    } else if (m.voiceUrl) {
      bubbleHtml = `<div class="bubble voice" data-play="${m.id}"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="#07c160"/></svg><span>${Math.max(1, Math.round((m.text || '').length / 4))}″</span></div>`;
    } else {
      bubbleHtml = `<div class="bubble">${escapeHtml(m.text)}</div>`;
    }

    const senderLabel = (group && !isMe) ? `<div class="sender-label">${escapeHtml(name)}</div>` : '';
    return dividerHtml + `<div class="msg-col ${isMe ? 'me' : ''}">
      ${senderLabel}
      <div class="msg-row ${isMe ? 'me' : ''}" data-id="${m.id}">${avatarHtml(avatarDataUrl, name, 40)}${bubbleHtml}</div>
    </div>`;
  }).join('');
  box.scrollTop = box.scrollHeight;
}

/* ============ 消息长按逻辑 ============ */
function bindMsgListDelegation() {
  const box = document.getElementById('msgList');
  if (!box) return;
  let pressTimer = null;
  let startX = 0, startY = 0;
  let longPressFired = false;

  box.addEventListener('touchstart', e => {
    const row = e.target.closest('.msg-row');
    if (!row) return;
    const t = e.touches[0];
    startX = t.clientX; startY = t.clientY;
    longPressFired = false;
    pressTimer = setTimeout(() => {
      longPressFired = true;
      try { window.getSelection()?.removeAllRanges(); } catch(_) {}
      openTarotSheet(row.dataset.id);
    }, 480);
  }, { passive: true });
  box.addEventListener('touchmove', e => {
    if (!pressTimer) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - startX) > 10 || Math.abs(t.clientY - startY) > 10) { clearTimeout(pressTimer); pressTimer = null; }
  }, { passive: true });
  box.addEventListener('touchend', () => { clearTimeout(pressTimer); pressTimer = null; }, { passive: true });
  box.addEventListener('touchcancel', () => { clearTimeout(pressTimer); pressTimer = null; }, { passive: true });
  box.addEventListener('contextmenu', e => e.preventDefault());

  box.addEventListener('click', e => {
    if (longPressFired) { longPressFired = false; return; }
    const playEl = e.target.closest('[data-play]');
    if (playEl) {
      const msg = (state.chats[state.activeChatId] || []).find(m => String(m.id) === playEl.dataset.play);
      if (msg?.voiceUrl) new Audio(msg.voiceUrl).play().catch(()=>{});
      return;
    }
    const rpEl = e.target.closest('[data-redpacket]');
    if (rpEl) { openRedPacketDetail(rpEl.dataset.redpacket); return; }
    const locEl = e.target.closest('[data-location]');
    if (locEl) { openViewLocation(locEl.dataset.location); return; }
    const callLogEl = e.target.closest('[data-calllog]');
    if (callLogEl) openCallLogView(callLogEl.dataset.calllog);
  });
}

function openTarotSheet(msgId) {
  const msg = (state.chats[state.activeChatId] || []).find(m => String(m.id) === String(msgId));
  if (!msg) return;
  const cardsView = document.getElementById('tarotCardsView');
  const shieldView = document.getElementById('shieldCardsView');
  if (cardsView) cardsView.innerHTML = (msg.cards || []).map(c => `<div class="tarot-card-mini"><div class="card-face">${c.name}</div><div>${c.reversed?'逆位':'正位'}</div></div>`).join('') || '<div style="font-size:13px;color:#999;">这条消息没有抽牌记录</div>';
  if (shieldView) shieldView.innerHTML = (msg.shieldCards || []).map(c => `<div class="tarot-card-mini"><div class="card-face">${c.name}</div><div>${c.reversed?'逆位':'正位'}</div></div>`).join('');
  const shield = msg.shield ?? 0;
  const fillEl = document.getElementById('shieldFill');
  const numEl = document.getElementById('shieldNum');
  if (fillEl) fillEl.style.width = shield + '%';
  if (numEl) numEl.textContent = shield;
  document.getElementById('tarotSheet')?.classList.remove('hidden');
}

/* ============ 发消息 & 塔罗回复 ============ */
function addMessage(chatId, from, text, extra = {}) {
  const msg = { id: Date.now() + Math.random(), from, text, ts: Date.now(), ...extra };
  if (!state.chats[chatId]) state.chats[chatId] = [];
  state.chats[chatId].push(msg);
  if (from !== 'me' && chatId !== state.activeChatId) {
    state.unread[chatId] = (state.unread[chatId] || 0) + 1;
  }
  persist();
  if (chatId === state.activeChatId) renderMessages();
  renderChatList();
  return msg;
}
function sendImageMessage(dataUrl) {
  const chatId = state.activeChatId; if (!chatId) return;
  addMessage(chatId, 'me', '[图片]', { type: 'image', image: dataUrl });
}
function lastMessageOf(chatId) {
  const msgs = state.chats[chatId] || [];
  return msgs[msgs.length - 1];
}

const AVATAR_CHANGE_KEYWORDS = ['换头像', '换个头像', '换张头像', '改头像'];
const LOCATION_ASK_KEYWORDS = ['你在哪', '你的位置', '分享位置', '你现在在哪', '定位'];

function handleSend(text) {
  const chatId = state.activeChatId;
  if (!chatId || !text || !text.trim()) return;
  const priorLast = lastMessageOf(chatId);
  addMessage(chatId, 'me', text.trim());

  // 广告消息对话：如果最近一条是广告消息，用纯AI回，不走塔罗字卡
  if (priorLast && priorLast.isAd && !isGroupChat(chatId)) {
    const contact = getContactById(priorLast.from);
    if (contact) {
      setTimeout(async () => {
        const replyText = await generateFreeformMomentText(drawCards(1), contact.persona, `延续这条广告消息的话题随意回应对方，语气自然口语化，不超过30字。之前的消息是：「${priorLast.text}」，对方刚说：「${text.trim()}」`);
        addMessage(chatId, contact.id, replyText, { isAd:true });
      }, 900);
    }
    return;
  }

  if (AVATAR_CHANGE_KEYWORDS.some(k => text.includes(k))) {
    if (isGroupChat(chatId)) {
      const g = getGroupById(chatId.slice(2));
      if (g?.memberIds?.length) requestAvatarChange(g.memberIds[secureRandomInt(g.memberIds.length)], chatId);
    } else requestAvatarChange(chatId, chatId);
  }
  if (LOCATION_ASK_KEYWORDS.some(k => text.includes(k)) && !isGroupChat(chatId)) {
    setTimeout(() => contactShareLocation(chatId, chatId), 1200);
  }

  state.pendingBatch[chatId] = state.pendingBatch[chatId] || [];
  state.pendingBatch[chatId].push(text.trim());
  clearTimeout(state.batchTimer[chatId]);
  state.batchTimer[chatId] = setTimeout(() => {
    if (isGroupChat(chatId)) processGroupBatch(chatId);
    else processSingleBatch(chatId);
  }, 900);
}

function showTypingIndicator(chatId, contact) {
  if (chatId !== state.activeChatId) return;
  const box = document.getElementById('msgList');
  if (!box || document.getElementById('typingIndicatorRow')) return;
  const row = document.createElement('div');
  row.id = 'typingIndicatorRow';
  row.className = 'msg-col';
  row.innerHTML = `<div class="msg-row">${avatarHtml(contact?.avatar, contact?.name, 40)}<div class="bubble typing-bubble"><span></span><span></span><span></span></div></div>`;
  box.appendChild(row);
  box.scrollTop = box.scrollHeight;
}
function hideTypingIndicator() {
  document.getElementById('typingIndicatorRow')?.remove();
}
async function replyWithTarot(chatId, fromId, text, persona) {
  const cards = drawCards(3);
  const shieldCards = drawCards(3);
  const shield = calcShield(shieldCards);
  const contact = getContactById(fromId);
  const pool = WordCards.getForContact(contact);

  showTypingIndicator(chatId, contact);
  try {
    if (shouldSendRedPacket(cards)) {
      const amount = randomRedPacketAmount();
      const note = pool[secureRandomInt(pool.length)] || '恭喜发财';
      addMessage(chatId, fromId, note, { type:'redpacket', cards, shieldCards, shield, redpacket:{ amount, note, status:'unclaimed', claimedBy:null } });
      return;
    }
    const picks = await interpretAndReply(text, cards, pool, persona);
    for (let i = 0; i < picks.length; i++) {
      await new Promise(r => setTimeout(r, 450));
      const voiceUrl = await synthesizeVoice(picks[i]);
      addMessage(chatId, fromId, picks[i], { cards, shieldCards, shield, voiceUrl });
      if (i < picks.length - 1) showTypingIndicator(chatId, contact);
    }
  } finally {
    hideTypingIndicator();
  }
}
async function processSingleBatch(contactId) {
  const batch = state.pendingBatch[contactId] || [];
  state.pendingBatch[contactId] = [];
  if (!batch.length) return;
  const contact = getContactById(contactId);
  const groups = await groupMessages(batch);
  for (const group of groups) await replyWithTarot(contactId, contactId, group.join('；'), contact?.persona);
}
async function processGroupBatch(groupId) {
  const batch = state.pendingBatch[groupId] || [];
  state.pendingBatch[groupId] = [];
  if (!batch.length) return;
  const g = getGroupById(groupId.slice(2));
  if (!g) return;
  const groups = await groupMessages(batch);
  const combinedText = groups.map(g2 => g2.join('；')).join('；');
  for (const memberId of g.memberIds) {
    const member = getContactById(memberId);
    await replyWithTarot(groupId, memberId, combinedText, member?.persona);
  }
}

/* ============ 换头像 ============ */
async function requestAvatarChange(contactId, chatId) {
  const contact = getContactById(contactId);
  if (!contact) return;
  if (!state.avatarLibrary.length) {
    addMessage(chatId, contactId, '（头像库是空的，先去"我 → 头像库管理"上传几张照片，我才能挑选新头像哦。也可以在"角色设置"里用"直接设置头像"一步到位）', { systemNote: true });
    return;
  }
  markOpStart('换头像');
  try {
    const cards = drawCards(3);
    const chosen = await pickAvatarFromCards(cards, state.avatarLibrary, contact.persona);
    if (!chosen || !chosen.dataUrl) {
      addMessage(chatId, contactId, '（换头像失败了，头像库里的图片数据好像有点问题，建议在"角色设置"里用"直接设置头像"手动指定）', { systemNote: true });
      markOpDone();
      return;
    }
    contact.avatar = chosen.dataUrl;
    persist();
    renderChatList(); renderContactList();
    if (chatId === state.activeChatId) renderMessages();
    addMessage(chatId, contactId, `${contact.name} 更换了头像`, { systemNote: true, cards });
  } catch (err) {
    addMessage(chatId, contactId, `（换头像出错了：${err?.message || '未知错误'}，建议改用"角色设置→直接设置头像"）`, { systemNote: true });
  } finally {
    markOpDone();
  }
}
function directSetContactAvatar(contactId, dataUrl) {
  const contact = getContactById(contactId);
  if (!contact) return;
  contact.avatar = dataUrl;
  persist();
  renderChatList(); renderContactList();
  if (String(state.activeChatId) === String(contactId)) renderMessages();
}

/* ============ 位置分享 ============ */
const PRESET_LOCATIONS = [
  {name:'市中心广场', x:50, y:45}, {name:'滨海大道', x:78, y:70}, {name:'老城区', x:22, y:30},
  {name:'科技产业园', x:65, y:20}, {name:'大学城', x:30, y:75}, {name:'国际机场', x:88, y:15},
  {name:'中央车站', x:45, y:85}, {name:'中央公园', x:55, y:55}
];
function sendLocationMessageManual(name, x, y) {
  const chatId = state.activeChatId; if (!chatId) return;
  addMessage(chatId, 'me', name || '我的位置', { type: 'location', locX: x, locY: y });
}
async function contactShareLocation(contactId, chatId) {
  const contact = getContactById(contactId);
  if (!contact) return;
  const loc = PRESET_LOCATIONS[secureRandomInt(PRESET_LOCATIONS.length)];
  addMessage(chatId, contactId, loc.name, { type: 'location', locX: loc.x, locY: loc.y });
}
function openLocationPicker() {
  const pin = document.getElementById('mapPickerPin');
  pin.classList.add('hidden');
  document.getElementById('locationNameInput').value = '';
  const chips = document.getElementById('presetChips');
  chips.innerHTML = PRESET_LOCATIONS.map((l,i) => `<div class="preset-chip" data-idx="${i}">${escapeHtml(l.name)}</div>`).join('');
  document.getElementById('locationPickerSheet').dataset.x = '';
  document.getElementById('locationPickerSheet').dataset.y = '';
  document.getElementById('locationPickerSheet').classList.remove('hidden');
}
function bindLocationPicker() {
  const canvas = document.getElementById('mapPickerCanvas');
  const pin = document.getElementById('mapPickerPin');
  const sheet = document.getElementById('locationPickerSheet');
  canvas.addEventListener('click', e => {
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(2, Math.min(98, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(4, Math.min(96, ((e.clientY - rect.top) / rect.height) * 100));
    pin.style.left = x + '%'; pin.style.top = y + '%'; pin.classList.remove('hidden');
    sheet.dataset.x = x.toFixed(1); sheet.dataset.y = y.toFixed(1);
    document.getElementById('locationNameInput').value = '自定义位置';
    document.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
  });
  document.getElementById('presetChips').addEventListener('click', e => {
    const chip = e.target.closest('[data-idx]'); if (!chip) return;
    const loc = PRESET_LOCATIONS[Number(chip.dataset.idx)];
    pin.style.left = loc.x + '%'; pin.style.top = loc.y + '%'; pin.classList.remove('hidden');
    sheet.dataset.x = loc.x; sheet.dataset.y = loc.y;
    document.getElementById('locationNameInput').value = loc.name;
    document.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
  });
  document.getElementById('locationPickerCancel')?.addEventListener('click', () => sheet.classList.add('hidden'));
  document.getElementById('locationPickerConfirm')?.addEventListener('click', () => {
    const x = sheet.dataset.x, y = sheet.dataset.y;
    if (!x || !y) { alert('请先在地图上点选一个位置'); return; }
    const name = document.getElementById('locationNameInput').value.trim() || '我的位置';
    sendLocationMessageManual(name, parseFloat(x), parseFloat(y));
    sheet.classList.add('hidden');
  });
}
function openViewLocation(msgId) {
  const msg = (state.chats[state.activeChatId] || []).find(m => String(m.id) === String(msgId));
  if (!msg) return;
  document.getElementById('viewLocationTitle').textContent = msg.text || '位置';
  const pin = document.getElementById('viewLocationPin');
  pin.style.left = msg.locX + '%'; pin.style.top = msg.locY + '%';
  document.getElementById('viewLocationSheet').classList.remove('hidden');
}
function bindViewLocation() {
  document.getElementById('viewLocationClose')?.addEventListener('click', () => document.getElementById('viewLocationSheet').classList.add('hidden'));
}

/* ============ 查看通话中的文字记录 ============ */
function openCallLogView(msgId) {
  const msg = (state.chats[state.activeChatId] || []).find(m => String(m.id) === String(msgId));
  if (!msg || !msg.callChatLog) return;
  const box = document.getElementById('callLogViewList');
  box.innerHTML = msg.callChatLog.map(e => `<div class="call-log-view-line"><span class="who">${e.from === 'me' ? (state.myName||'我') : '对方'}：</span>${escapeHtml(e.text)}</div>`).join('') || '<div style="color:#999;text-align:center;padding:20px;">没有对话记录</div>';
  document.getElementById('callLogViewSheet').classList.remove('hidden');
}
function bindCallLogView() {
  document.getElementById('callLogViewClose')?.addEventListener('click', () => document.getElementById('callLogViewSheet').classList.add('hidden'));
}

/* ============ 通话系统 ============ */
let _callLocalStream = null;
let _callTimer = null;
let _callSeconds = 0;
let _callMuted = false;
let _callSpeakerOn = false;
let _callActiveContact = null;
let _callActiveType = 'voice';
let _callChatLog = [];
let _callRecognizer = null;

function initCallRecognizer() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const r = new SR();
  r.lang = 'zh-CN';
  r.continuous = false;
  r.onresult = ev => { const text = ev.results[0][0]?.transcript; if (text) sendDuringCall(text); };
  r.onerror = () => document.getElementById('callVoiceHoldBtn')?.classList.remove('active');
  r.onend = () => document.getElementById('callVoiceHoldBtn')?.classList.remove('active');
  return r;
}
function addCallLogEntry(from, text) { _callChatLog.push({ from, text, ts: Date.now() }); renderCallLogBox(); }
function renderCallLogBox() {
  const box = document.getElementById('callChatLogBox');
  if (!box) return;
  box.innerHTML = _callChatLog.map(e => `<div class="call-log-line ${e.from === 'me' ? 'me' : ''}">${escapeHtml(e.text)}</div>`).join('');
  box.scrollTop = box.scrollHeight;
}
async function sendDuringCall(text) {
  if (!text || !text.trim() || !_callActiveContact) return;
  addCallLogEntry('me', text.trim());
  const contact = _callActiveContact;
  const cards = drawCards(3);
  const pool = WordCards.getForContact(contact);
  const picks = await interpretAndReply(text.trim(), cards, pool, contact.persona);
  const replyText = picks.join(' ');
  addCallLogEntry('contact', replyText);
  const cfg = getAIConfig();
  if (cfg.voiceEnabled) {
    const voiceUrl = await synthesizeVoice(replyText);
    if (voiceUrl) { const audio = new Audio(voiceUrl); audio.play().catch(()=>{}); }
  }
}
function renderCallRemoteMedia(contact, type) {
  const remoteArea = document.getElementById('callRemoteArea');
  remoteArea.innerHTML = '';
  if (type === 'video' && contact.callMedia) {
    if (contact.callMediaType === 'video') remoteArea.innerHTML = `<video id="callRemoteVideo" autoplay loop muted playsinline src="${contact.callMedia}"></video>`;
    else remoteArea.innerHTML = `<img src="${contact.callMedia}">`;
  } else {
    const circle = document.createElement('div');
    circle.className = 'call-remote-circle';
    if (contact.avatar) { circle.style.backgroundImage = `url('${contact.avatar}')`; circle.style.backgroundSize='cover'; circle.style.backgroundPosition='center'; circle.textContent=''; }
    else { circle.style.background = hashColor(contact.name); circle.textContent = contact.name.slice(0,1); }
    const ring1 = document.createElement('div'); ring1.className = 'call-pulse-ring';
    const ring2 = document.createElement('div'); ring2.className = 'call-pulse-ring'; ring2.style.animationDelay = '1s';
    remoteArea.appendChild(ring1); remoteArea.appendChild(ring2); remoteArea.appendChild(circle);
  }
  if (type === 'video') {
    const uploadBtn = document.createElement('div');
    uploadBtn.className = 'call-remote-upload-btn';
    uploadBtn.id = 'callRemoteUploadBtnDynamic';
    uploadBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>';
    remoteArea.appendChild(uploadBtn);
    if (!contact.callMedia) {
      const hint = document.createElement('div');
      hint.className = 'call-remote-upload-hint';
      hint.textContent = '上传对方的形象(图片/视频)';
      remoteArea.appendChild(hint);
    }
  }
}
async function openCallOverlay(type, contact) {
  if (!contact) { alert('请先选择一个角色'); return; }
  _callActiveContact = contact; _callActiveType = type;
  _callSeconds = 0; _callMuted = false; _callSpeakerOn = false; _callChatLog = [];
  document.getElementById('callMuteBtn').classList.remove('active');
  document.getElementById('callSpeakerBtn').classList.remove('active');
  document.getElementById('callTextChat').classList.add('hidden');
  document.getElementById('callMiniPill').classList.add('hidden');
  renderCallLogBox();
  document.getElementById('callTypeLabel').textContent = type === 'video' ? '视频通话' : '语音通话';
  document.getElementById('callName').textContent = contact.name;
  document.getElementById('callStatus').textContent = '正在呼叫...';
  renderCallRemoteMedia(contact, type);
  const localPreview = document.getElementById('callLocalPreview');
  if (type === 'video') {
    localPreview.classList.remove('hidden');
    try { _callLocalStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); document.getElementById('callLocalVideo').srcObject = _callLocalStream; }
    catch (e) { console.warn('摄像头/麦克风获取失败', e); localPreview.classList.add('hidden'); }
  } else {
    localPreview.classList.add('hidden');
    try { _callLocalStream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { console.warn('麦克风获取失败', e); _callLocalStream = null; }
  }
  _callRecognizer = initCallRecognizer();
  document.getElementById('callOverlay').classList.remove('hidden');
  clearInterval(_callTimer);
  setTimeout(() => { const s = document.getElementById('callStatus'); if (s) s.textContent = '通话中 00:00'; }, 1500);
  _callTimer = setInterval(() => {
    _callSeconds++;
    if (_callSeconds >= 2) {
      const m = Math.floor(_callSeconds/60), s = _callSeconds%60;
      const label = `通话中 ${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      const statusEl = document.getElementById('callStatus');
      if (statusEl) statusEl.textContent = label;
      const pillText = document.getElementById('callMiniPillText');
      if (pillText) pillText.textContent = label.replace('通话中 ', '通话 ');
    }
  }, 1000);
}
function closeCallOverlay() {
  clearInterval(_callTimer);
  if (_callLocalStream) { _callLocalStream.getTracks().forEach(t => t.stop()); _callLocalStream = null; }
  if (_callRecognizer) { try { _callRecognizer.stop(); } catch(e) {} _callRecognizer = null; }
  document.getElementById('callOverlay').classList.add('hidden');
  document.getElementById('callMiniPill').classList.add('hidden');
  const chatId = state.activeChatId;
  if (chatId && _callSeconds >= 1) {
    const m = Math.floor(_callSeconds/60), s = _callSeconds%60;
    const durationText = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    addMessage(chatId, 'me', '', { type:'call', callType: _callActiveType, callDurationText: durationText, callChatLog: _callChatLog.length ? [..._callChatLog] : null });
  }
  _callSeconds = 0; _callActiveContact = null; _callChatLog = [];
}
function minimizeCall() {
  document.getElementById('callOverlay').classList.add('hidden');
  const pill = document.getElementById('callMiniPill');
  const pillAvatar = document.getElementById('callMiniPillAvatar');
  if (_callActiveContact) {
    pillAvatar.style.backgroundImage = _callActiveContact.avatar ? `url('${_callActiveContact.avatar}')` : '';
    pillAvatar.style.backgroundColor = _callActiveContact.avatar ? 'transparent' : hashColor(_callActiveContact.name);
  }
  pill.classList.remove('hidden');
}
function restoreCall() { document.getElementById('callMiniPill').classList.add('hidden'); document.getElementById('callOverlay').classList.remove('hidden'); }
function bindCallOverlay() {
  document.getElementById('callHangupBtn')?.addEventListener('click', closeCallOverlay);
  document.getElementById('callMinimizeBtn')?.addEventListener('click', minimizeCall);
  document.getElementById('callMiniPill')?.addEventListener('click', restoreCall);
  document.getElementById('callMuteBtn')?.addEventListener('click', () => {
    _callMuted = !_callMuted;
    document.getElementById('callMuteBtn').classList.toggle('active', _callMuted);
    if (_callLocalStream) _callLocalStream.getAudioTracks().forEach(t => t.enabled = !_callMuted);
  });
  document.getElementById('callSpeakerBtn')?.addEventListener('click', () => {
    _callSpeakerOn = !_callSpeakerOn;
    document.getElementById('callSpeakerBtn').classList.toggle('active', _callSpeakerOn);
    const remoteVideo = document.getElementById('callRemoteVideo');
    if (remoteVideo) remoteVideo.muted = !_callSpeakerOn;
  });
  document.getElementById('callKeyboardBtn')?.addEventListener('click', () => document.getElementById('callTextChat').classList.toggle('hidden'));
  document.getElementById('callTextSendBtn')?.addEventListener('click', () => {
    const input = document.getElementById('callTextInput');
    if (input.value.trim()) { sendDuringCall(input.value.trim()); input.value = ''; }
  });
  document.getElementById('callTextInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.value.trim()) { sendDuringCall(e.target.value.trim()); e.target.value = ''; }
  });
  const voiceHoldBtn = document.getElementById('callVoiceHoldBtn');
  voiceHoldBtn?.addEventListener('pointerdown', () => {
    voiceHoldBtn.classList.add('active');
    if (_callRecognizer) { try { _callRecognizer.start(); } catch(e){} }
    else alert('当前浏览器不支持语音识别，请使用键盘打字');
  });
  const stopVoiceHold = () => { voiceHoldBtn?.classList.remove('active'); if (_callRecognizer) { try { _callRecognizer.stop(); } catch(e){} } };
  voiceHoldBtn?.addEventListener('pointerup', stopVoiceHold);
  voiceHoldBtn?.addEventListener('pointerleave', stopVoiceHold);
  document.getElementById('callRemoteArea')?.addEventListener('click', e => { if (e.target.closest('#callRemoteUploadBtnDynamic')) document.getElementById('callInCallMediaFileInput').click(); });
  document.getElementById('callInCallMediaFileInput')?.addEventListener('change', e => {
    const file = e.target.files[0]; if (!file || !_callActiveContact) return;
    const isVideo = file.type.startsWith('video/');
    const reader = new FileReader();
    reader.onload = ev => { _callActiveContact.callMedia = ev.target.result; _callActiveContact.callMediaType = isVideo ? 'video' : 'image'; persist(); renderCallRemoteMedia(_callActiveContact, _callActiveType); };
    reader.readAsDataURL(file);
    e.target.value = '';
  });
}

/* ============ AI 自主行为 ============ */
async function aiAutoSendMessage() {
  const cfg = getAIConfig();
  if (!cfg.autoMsg || !state.contacts.length) return;
  const contact = state.contacts[secureRandomInt(state.contacts.length)];
  await replyWithTarot(String(contact.id), String(contact.id), '(主动发起对话)', contact.persona);
}
async function aiAutoPostMoment() {
  const cfg = getAIConfig();
  if (!cfg.autoMoment || !state.contacts.length) return;
  const contact = state.contacts[secureRandomInt(state.contacts.length)];
  const cards = drawCards(3);
  const content = await generateFreeformMomentText(cards, contact.persona, '发一条真实自然的朋友圈动态');
  state.moments.unshift({ id: Date.now(), contactId: contact.id, name: contact.name, avatar: contact.avatar, content, image: null, cards, ts: Date.now(), comments: [] });
  persist(); renderMoments();
}
async function aiAutoChangeAvatar() {
  const cfg = getAIConfig();
  if (!cfg.autoAvatar || !state.contacts.length || !state.avatarLibrary.length) return;
  const contact = state.contacts[secureRandomInt(state.contacts.length)];
  await requestAvatarChange(String(contact.id), String(contact.id));
}
async function maybeSendDailyAdMessage() {
  if (!state.contacts.length) return;
  const today = new Date().toISOString().slice(0,10);
  let ad = getAdDailyState();
  if (ad.date !== today) ad = { date: today, count: 0 };
  if (ad.count >= 2) { saveAdDailyState(ad); return; }
  if (secureRandomInt(100) >= 6) { saveAdDailyState(ad); return; }
  const contact = state.contacts[secureRandomInt(state.contacts.length)];
  const cards = drawCards(1);
  let text = await generateFreeformMomentText(cards, contact.persona, '生成一条像正规商业广告/推广文案一样的消息，语气自然俏皮，不超过30字，不要出现塔罗/占卜相关字眼');
  if (!text) text = AD_FALLBACK_TEMPLATES[secureRandomInt(AD_FALLBACK_TEMPLATES.length)];
  addMessage(String(contact.id), contact.id, text, { isAd:true });
  ad.count++;
  saveAdDailyState(ad);
}
setInterval(() => { try { if (secureRandomInt(100) < 3) aiAutoSendMessage(); } catch(e){ console.error(e); } }, 60000);
setInterval(() => { try { if (secureRandomInt(100) < 2) aiAutoPostMoment(); } catch(e){ console.error(e); } }, 120000);
setInterval(() => { try { if (secureRandomInt(100) < 2) aiAutoChangeAvatar(); } catch(e){ console.error(e); } }, 150000);
setInterval(() => { try { maybeSendDailyAdMessage(); } catch(e){ console.error(e); } }, 90000);

/* ============ 朋友圈评论逻辑（纯AI） ============ */
function pickReplyingContactForMoment(moment) {
  const posterContact = getContactById(moment.contactId);
  if (posterContact) return posterContact;
  const priorCommenter = (moment.comments || []).slice().reverse().find(c => c.contactId);
  if (priorCommenter) { const c = getContactById(priorCommenter.contactId); if (c) return c; }
  if (state.contacts.length) return state.contacts[secureRandomInt(state.contacts.length)];
  return null;
}
async function aiReplyToMoment(momentId, userComment) {
  const moment = state.moments.find(m => m.id === momentId);
  if (!moment) return;
  moment.comments = moment.comments || [];
  moment.comments.push({ from: 'me', text: userComment });
  const contact = pickReplyingContactForMoment(moment);
  if (!contact) { persist(); renderMoments(); return; }
  const cards = drawCards(3);
  const text = await generateFreeformMomentText(cards, contact.persona, `我在你发的朋友圈"${moment.content}"下面留言说："${userComment}"，请给出一句自然真实的回复`);
  moment.comments.push({ from: contact.name, text, cards, contactId: contact.id });
  persist(); renderMoments();
}
async function aiCommentOnUserMoment(momentId, contactId) {
  const moment = state.moments.find(m => m.id === momentId);
  const contact = getContactById(contactId);
  if (!moment || !contact) return;
  const cards = drawCards(3);
  const text = await generateFreeformMomentText(cards, contact.persona, `看到我发的朋友圈内容是："${moment.content}"，请给出一句简短真实的评论`);
  moment.comments = moment.comments || [];
  moment.comments.push({ from: contact.name, text, cards, contactId: contact.id });
  persist();
  renderMoments();
}

/* ============ 朋友圈展示/发布（含置顶 + 详情页跳转） ============ */
function renderMoments() {
  const box = document.getElementById('momentsList');
  if (!box) return;
  const sorted = [...state.moments].sort((a, b) => ((b.pinned?1:0) - (a.pinned?1:0)));
  box.innerHTML = sorted.map(m => `
    <div class="moment-item" data-id="${m.id}">
      ${avatarHtml(m.avatar, m.name, 44)}
      <div class="moment-body">
        <div class="moment-header" data-detail="${m.id}">
          <div class="mname">${escapeHtml(m.name)} ${m.pinned ? '<span class="pin-badge"><svg viewBox="0 0 24 24"><path d="M12 2l3 6 6 1-4.5 4.5 1 6.5-5.5-3-5.5 3 1-6.5L3 9l6-1z" fill="#999"/></svg>置顶</span>' : ''}</div>
          ${m.content ? `<div class="content">${escapeHtml(m.content)}</div>` : ''}
          ${m.image ? `<img src="${m.image}" class="moment-image">` : ''}
        </div>
        <div class="time-row"><span class="time">${formatMomentFeedTime(m.ts)}</span>
          <span>
            ${m.contactId === 'me' ? `<span class="comment-btn" data-toggle-pin="${m.id}" style="margin-right:6px;">${m.pinned ? '取消置顶' : '置顶'}</span>` : ''}
            <span class="comment-btn" data-toggle-comment="${m.id}">评论</span>
          </span>
        </div>
        ${(m.comments?.length) ? `<div class="comment-list">${m.comments.map(c => `<div class="comment-line"><b>${escapeHtml(c.from === 'me' ? (state.myName||'我') : c.from)}：</b>${escapeHtml(c.text)}</div>`).join('')}</div>` : ''}
        <div class="comment-input-row hidden" data-comment-row="${m.id}"><input placeholder="评论一下..." data-comment-input="${m.id}"><button data-comment-submit="${m.id}">发送</button></div>
      </div>
    </div>`).join('') || `<div style="padding:40px;text-align:center;color:#999;">还没有朋友圈动态</div>`;
}
function bindMomentsDelegation() {
  const box = document.getElementById('momentsList');
  if (!box) return;
  box.addEventListener('click', e => {
    const detailEl = e.target.closest('[data-detail]');
    if (detailEl) { openMomentDetail(Number(detailEl.dataset.detail)); return; }
    const pinToggle = e.target.closest('[data-toggle-pin]');
    if (pinToggle) {
      const id = Number(pinToggle.dataset.togglePin);
      const m = state.moments.find(x => x.id === id);
      if (m) { m.pinned = !m.pinned; persist(); renderMoments(); }
      return;
    }
    const toggle = e.target.closest('[data-toggle-comment]');
    if (toggle) { box.querySelector(`[data-comment-row="${toggle.dataset.toggleComment}"]`)?.classList.toggle('hidden'); return; }
    const submit = e.target.closest('[data-comment-submit]');
    if (submit) {
      const id = Number(submit.dataset.commentSubmit);
      const input = box.querySelector(`[data-comment-input="${id}"]`);
      if (input?.value.trim()) { aiReplyToMoment(id, input.value.trim()); input.value = ''; }
    }
  });
}

/* ============ 朋友圈详情页（含封面+日期） ============ */
let _currentMomentDetailId = null;
function openMomentDetail(momentId) {
  const m = state.moments.find(x => x.id === momentId);
  if (!m) return;
  _currentMomentDetailId = momentId;
  const isMe = m.contactId === 'me';
  document.getElementById('momentDetailCover').style.backgroundImage = isMe && state.momentsCover ? `url('${state.momentsCover}')` : '';
  if (!(isMe && state.momentsCover)) {
    document.getElementById('momentDetailCover').style.background = `linear-gradient(135deg, ${hashColor(m.name)}, ${hashColorDark(m.name)})`;
  }
  document.getElementById('momentDetailName').textContent = m.name;
  const avatarEl = document.getElementById('momentDetailAvatar');
  avatarEl.style.backgroundImage = m.avatar ? `url('${m.avatar}')` : '';
  avatarEl.style.backgroundColor = m.avatar ? 'transparent' : hashColor(m.name);
  avatarEl.style.backgroundSize = 'cover'; avatarEl.style.backgroundPosition = 'center';
  avatarEl.textContent = m.avatar ? '' : m.name.slice(0,1);
  if (!m.avatar) { avatarEl.style.display='flex'; avatarEl.style.alignItems='center'; avatarEl.style.justifyContent='center'; avatarEl.style.color='#fff'; avatarEl.style.fontSize='22px'; avatarEl.style.fontWeight='600'; }
  document.getElementById('momentDetailDate').textContent = formatMomentDate(m.ts);
  document.getElementById('momentDetailContent').textContent = m.content || '';
  document.getElementById('momentDetailImageWrap').innerHTML = m.image ? `<img src="${m.image}" style="width:100%;border-radius:8px;display:block;">` : '';
  document.getElementById('momentDetailComments').innerHTML = (m.comments?.length) ? m.comments.map(c => `<div class="comment-line" style="border-bottom:1px solid #f2f2f2;padding:6px 0;"><b>${escapeHtml(c.from === 'me' ? (state.myName||'我') : c.from)}：</b>${escapeHtml(c.text)}</div>`).join('') : '<div style="color:#999;font-size:13px;padding:8px 0;">还没有评论</div>';
  pushPage('page-moment-detail');
}
function bindMomentDetailPage() {
  document.getElementById('backFromMomentDetail')?.addEventListener('click', () => popPage());
  document.getElementById('momentDetailCommentSend')?.addEventListener('click', () => {
    const input = document.getElementById('momentDetailCommentInput');
    if (input.value.trim() && _currentMomentDetailId) {
      aiReplyToMoment(_currentMomentDetailId, input.value.trim());
      input.value = '';
      setTimeout(() => openMomentDetail(_currentMomentDetailId), 50);
    }
  });
}

let _postMomentImage = null;
function bindPostMoment() {
  document.getElementById('btnPostMoment')?.addEventListener('click', () => {
    document.getElementById('postMomentText').value = '';
    document.getElementById('postMomentImgPreview').innerHTML = '';
    _postMomentImage = null;
    document.getElementById('postMomentSheet').classList.remove('hidden');
  });
  document.getElementById('postMomentCancel')?.addEventListener('click', () => document.getElementById('postMomentSheet').classList.add('hidden'));
  document.getElementById('postMomentAddImgBtn')?.addEventListener('click', () => document.getElementById('postMomentImgInput').click());
  document.getElementById('postMomentImgInput')?.addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      _postMomentImage = ev.target.result;
      document.getElementById('postMomentImgPreview').innerHTML = `<img src="${_postMomentImage}" style="width:70px;height:70px;object-fit:cover;border-radius:8px;">`;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });
  document.getElementById('postMomentConfirm')?.addEventListener('click', () => {
    const text = document.getElementById('postMomentText').value.trim();
    if (!text && !_postMomentImage) { alert('写点什么或加张图吧'); return; }
    const moment = { id: Date.now(), contactId: 'me', name: state.myName || '我', avatar: state.myAvatar, content: text, image: _postMomentImage, ts: Date.now(), comments: [] };
    state.moments.unshift(moment);
    persist(); renderMoments();
    document.getElementById('postMomentSheet').classList.add('hidden');
    if (state.contacts.length) {
      const commenterCount = Math.min(state.contacts.length, 1 + secureRandomInt(2));
      const shuffled = [...state.contacts].sort(() => secureRandomInt(2) - 0.5);
      shuffled.slice(0, commenterCount).forEach((contact, i) => {
        setTimeout(() => aiCommentOnUserMoment(moment.id, contact.id), 2000 + i * 2500 + secureRandomInt(3000));
      });
    }
  });
}

/* ============ 发送选项（2~8个 + 其他，其他会走字卡回复） ============ */
let _optionsDraft = [];
function renderOptionsInputList() {
  const box = document.getElementById('optionsInputList');
  if (!box) return;
  box.innerHTML = _optionsDraft.map((v, i) => `
    <div class="option-input-row">
      <input type="text" data-opt-index="${i}" placeholder="选项 ${i + 1}" maxlength="20" value="${escapeHtml(v)}">
      ${_optionsDraft.length > 2 ? `<span class="option-del" data-opt-del="${i}">×</span>` : ''}
    </div>`).join('');
  const addBtn = document.getElementById('optionsAddBtn');
  if (addBtn) addBtn.style.display = _optionsDraft.length >= 8 ? 'none' : '';
}
function openSendOptions() {
  _optionsDraft = ['', ''];
  renderOptionsInputList();
  document.getElementById('sendOptionsSheet')?.classList.remove('hidden');
}
function bindSendOptions() {
  document.getElementById('optionsCancel')?.addEventListener('click', () => document.getElementById('sendOptionsSheet').classList.add('hidden'));
  document.getElementById('optionsAddBtn')?.addEventListener('click', () => {
    if (_optionsDraft.length >= 8) return;
    _optionsDraft.push('');
    renderOptionsInputList();
  });
  document.getElementById('optionsInputList')?.addEventListener('input', e => {
    const inp = e.target.closest('[data-opt-index]'); if (!inp) return;
    _optionsDraft[Number(inp.dataset.optIndex)] = inp.value;
  });
  document.getElementById('optionsInputList')?.addEventListener('click', e => {
    const del = e.target.closest('[data-opt-del]'); if (!del) return;
    if (_optionsDraft.length <= 2) return;
    _optionsDraft.splice(Number(del.dataset.optDel), 1);
    renderOptionsInputList();
  });
  document.getElementById('optionsConfirm')?.addEventListener('click', () => {
    const chatId = state.activeChatId;
    if (!chatId) { alert('请先进入一个聊天'); return; }
    const options = _optionsDraft.map(s => s.trim()).filter(Boolean).slice(0, 8);
    if (options.length < 2) { alert('至少填写 2 个选项'); return; }
    document.getElementById('sendOptionsSheet').classList.add('hidden');
    sendOptionsMessage(chatId, options);
  });
}
function sendOptionsMessage(chatId, options) {
  addMessage(chatId, 'me', '[选项]', { type: 'options', options });
  let responder = chatId;
  if (isGroupChat(chatId)) {
    const g = getGroupById(chatId.slice(2));
    responder = g?.memberIds?.[secureRandomInt(g.memberIds.length)];
  }
  if (!responder) return;
  replyToOptions(chatId, responder, options, getContactById(responder)?.persona);
}
async function replyToOptions(chatId, fromId, options, persona) {
  const idx = secureRandomInt(options.length + 1); // last slot = 其他
  if (idx === options.length) {
    await replyWithTarot(chatId, fromId, `(对方给出了选项：${options.join('、')}；我选择"其他"，用自己的话回应)`, persona);
    return;
  }
  const contact = getContactById(fromId);
  showTypingIndicator(chatId, contact);
  try {
    await new Promise(r => setTimeout(r, 500 + secureRandomInt(700)));
    const cards = drawCards(3);
    const shieldCards = drawCards(3);
    const shield = calcShield(shieldCards);
    const voiceUrl = await synthesizeVoice(options[idx]);
    addMessage(chatId, fromId, options[idx], { cards, shieldCards, shield, voiceUrl });
  } finally {
    hideTypingIndicator();
  }
}

/* ============ 红包（含领取即入账钱包） ============ */
function openSendRedPacket() { document.getElementById('sendRedPacketSheet')?.classList.remove('hidden'); }
function bindRedPacket() {
  document.getElementById('rpCancel')?.addEventListener('click', () => document.getElementById('sendRedPacketSheet').classList.add('hidden'));
  document.getElementById('rpConfirm')?.addEventListener('click', () => {
    const amount = parseFloat(document.getElementById('rpAmount').value);
    const note = document.getElementById('rpNote').value.trim() || '恭喜发财，大吉大利';
    if (!amount || amount <= 0) { alert('请输入有效金额'); return; }
    const chatId = state.activeChatId;
    if (!chatId) { alert('请先进入一个聊天'); return; }
    const msg = addMessage(chatId, 'me', note, { type:'redpacket', redpacket:{ amount: amount.toFixed(2), note, status:'unclaimed', claimedBy:null } });
    document.getElementById('sendRedPacketSheet').classList.add('hidden');
    document.getElementById('rpAmount').value = ''; document.getElementById('rpNote').value = '';
    setTimeout(() => {
      const list = state.chats[chatId] || [];
      const target = list.find(m => m.id === msg.id);
      if (!target || target.redpacket.status === 'claimed') return;
      let claimer;
      if (isGroupChat(chatId)) { const g = getGroupById(chatId.slice(2)); claimer = g?.memberIds?.[secureRandomInt(g.memberIds.length)]; }
      else claimer = chatId;
      if (!claimer) return;
      const claimerName = getContactById(claimer)?.name || '对方';
      target.redpacket.status = 'claimed'; target.redpacket.claimedBy = claimer;
      persist(); renderMessages();
      addMessage(chatId, claimer, `${claimerName} 领取了你的红包`, { systemNote: true });
      replyWithTarot(chatId, claimer, '(收到了你发的红包，表达感谢)', getContactById(claimer)?.persona);
    }, 1500 + secureRandomInt(3000));
  });
}
function openRedPacketDetail(msgId) {
  const msg = (state.chats[state.activeChatId] || []).find(m => String(m.id) === String(msgId));
  if (!msg) return;
  const senderAvatar = msg.from === 'me' ? state.myAvatar : getContactById(msg.from)?.avatar;
  const avatarEl = document.getElementById('rpDetailAvatar');
  if (avatarEl) avatarEl.style.backgroundImage = senderAvatar ? `url('${senderAvatar}')` : '';
  const noteEl = document.getElementById('rpDetailNote');
  if (noteEl) noteEl.textContent = msg.redpacket.note;
  const resultBox = document.getElementById('rpDetailResult');
  const midBox = document.getElementById('rpDetailMid');
  const amountShow = document.getElementById('rpAmountShow');
  if (msg.redpacket.status === 'claimed') {
    midBox.classList.add('hidden'); resultBox.classList.remove('hidden');
    amountShow.textContent = `¥${msg.redpacket.amount}`;
  } else {
    midBox.classList.remove('hidden'); resultBox.classList.add('hidden');
    midBox.onclick = () => {
      if (msg.from === 'me') { alert('自己发的红包不能自己领取哦'); return; }
      if (msg.redpacket.status === 'claimed') return;
      msg.redpacket.status = 'claimed'; msg.redpacket.claimedBy = 'me';
      const w = getWallet();
      const amt = parseFloat(msg.redpacket.amount) || 0;
      w.balance += amt;
      w.transactions.push({ title: `收到红包-${getContactById(msg.from)?.name || '对方'}`, amount: amt, ts: Date.now() });
      saveWallet(w);
      persist(); renderMessages();
      midBox.classList.add('hidden'); resultBox.classList.remove('hidden');
      amountShow.textContent = `¥${msg.redpacket.amount}`;
    };
  }
  document.getElementById('redPacketOpenSheet')?.classList.remove('hidden');
}

/* ============ 塔罗弹层 & 字卡管理 ============ */
function bindSheetClose() { document.getElementById('sheetClose')?.addEventListener('click', () => document.getElementById('tarotSheet').classList.add('hidden')); }
function renderWordCardList(contactId) {
  const list = contactId ? WordCards.getContactList(contactId) : WordCards.getAll();
  const box = document.getElementById('wordCardList');
  if (box) box.innerHTML = list.map(t => `<div class="wc-item"><span>${escapeHtml(t)}</span><a href="#" class="wc-del" data-t="${escapeHtml(t)}">删除</a></div>`).join('');
}
let currentWordCardContactId = null;
function openWordCardSheet(contactId = null) {
  currentWordCardContactId = contactId;
  const title = document.getElementById('wordCardSheetTitle');
  if (title) title.textContent = contactId ? `字卡管理（${getContactById(contactId)?.name || ''} 专属）` : '字卡管理（全局）';
  renderWordCardList(contactId);
  document.getElementById('wordCardSheet')?.classList.remove('hidden');
}
function bindWordCardSheet() {
  document.getElementById('rowWordCards')?.addEventListener('click', () => openWordCardSheet(null));
  document.getElementById('wordCardClose')?.addEventListener('click', () => document.getElementById('wordCardSheet').classList.add('hidden'));
  document.getElementById('addWordCardBtn')?.addEventListener('click', () => {
    const input = document.getElementById('newWordCard');
    if (!input.value.trim()) return;
    if (currentWordCardContactId) WordCards.addContactCard(currentWordCardContactId, input.value.trim());
    else WordCards.add(input.value.trim());
    input.value = ''; renderWordCardList(currentWordCardContactId);
  });
  document.getElementById('wordCardList')?.addEventListener('click', e => {
    const del = e.target.closest('.wc-del'); if (!del) return; e.preventDefault();
    if (currentWordCardContactId) WordCards.removeContactCard(currentWordCardContactId, del.dataset.t);
    else WordCards.remove(del.dataset.t);
    renderWordCardList(currentWordCardContactId);
  });
}

/* ============ 底部"+"面板 ============ */
function bindPlusPanel() {
  const panel = document.getElementById('plusPanelInline');
  document.getElementById('btnMore')?.addEventListener('click', () => panel?.classList.toggle('hidden'));
  const pagesEl = document.getElementById('plusPanelGrid');
  pagesEl?.addEventListener('scroll', () => {
    const idx = Math.round(pagesEl.scrollLeft / pagesEl.clientWidth);
    document.querySelectorAll('#plusPanelDots .plus-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
  });
  document.getElementById('plusPanelGrid')?.addEventListener('click', e => {
    const item = e.target.closest('[data-action]'); if (!item) return;
    const action = item.dataset.action;
    panel?.classList.add('hidden');
    if (action === 'photo') document.getElementById('sendPhotoFileInput').click();
    else if (action === 'camera') document.getElementById('sendCameraFileInput').click();
    else if (action === 'redpacket') openSendRedPacket();
    else if (action === 'options') openSendOptions();
    else if (action === 'sticker') { renderStickerGrid(); document.getElementById('stickerPickerSheet').classList.remove('hidden'); }
    else if (action === 'location') openLocationPicker();
    else if (action === 'videocall' || action === 'voicecall') {
      const chatId = state.activeChatId;
      if (isGroupChat(chatId)) { alert('群聊暂不支持通话'); return; }
      const contact = getContactById(chatId);
      openCallOverlay(action === 'videocall' ? 'video' : 'voice', contact);
    } else alert('该功能暂未开放');
  });
  document.getElementById('sendPhotoFileInput')?.addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader(); reader.onload = ev => sendImageMessage(ev.target.result); reader.readAsDataURL(file); e.target.value = '';
  });
  document.getElementById('sendCameraFileInput')?.addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader(); reader.onload = ev => sendImageMessage(ev.target.result); reader.readAsDataURL(file); e.target.value = '';
  });
}
function renderStickerGrid() {
  const grid = document.getElementById('stickerGrid'); if (!grid) return;
  const stickers = getStickers();
  grid.innerHTML = stickers.map(s => `<div class="avatar-lib-item" data-sticker-id="${s.id}"><img src="${s.dataUrl}"><div class="del-x" data-del-sticker="${s.id}">×</div></div>`).join('') || '<div style="grid-column:1/-1;color:#999;text-align:center;padding:24px;font-size:13px;">还没有表情包，点下方按钮添加</div>';
}
function bindStickerPicker() {
  document.getElementById('stickerAddBtn')?.addEventListener('click', () => document.getElementById('stickerFileInput').click());
  document.getElementById('stickerFileInput')?.addEventListener('change', e => {
    const files = [...e.target.files]; let remaining = files.length;
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => { const stickers = getStickers(); stickers.push({ id: Date.now()+Math.random(), dataUrl: ev.target.result }); saveStickers(stickers); remaining--; if (remaining===0) renderStickerGrid(); };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  });
  document.getElementById('stickerPickerClose')?.addEventListener('click', () => document.getElementById('stickerPickerSheet').classList.add('hidden'));
  document.getElementById('stickerGrid')?.addEventListener('click', e => {
    const del = e.target.closest('[data-del-sticker]');
    if (del) { const stickers = getStickers().filter(s => String(s.id) !== del.dataset.delSticker); saveStickers(stickers); renderStickerGrid(); return; }
    const item = e.target.closest('[data-sticker-id]');
    if (item) { const s = getStickers().find(x => String(x.id) === item.dataset.stickerId); if (s) { sendImageMessage(s.dataUrl); document.getElementById('stickerPickerSheet').classList.add('hidden'); } }
  });
}

/* ============ 添加角色 / 群聊 ============ */
function bindAddMenu() {
  const open = () => document.getElementById('addMenuSheet').classList.remove('hidden');
  document.getElementById('btnAddMenu')?.addEventListener('click', open);
  document.getElementById('btnAddMenu2')?.addEventListener('click', open);
  document.getElementById('addMenuClose')?.addEventListener('click', () => document.getElementById('addMenuSheet').classList.add('hidden'));
  document.getElementById('menuAddContact')?.addEventListener('click', () => { document.getElementById('addMenuSheet').classList.add('hidden'); document.getElementById('addContactSheet').classList.remove('hidden'); });
  document.getElementById('menuAddGroup')?.addEventListener('click', () => { document.getElementById('addMenuSheet').classList.add('hidden'); openAddGroupSheet(); });
}
function bindAddContact() {
  document.getElementById('addContactCancel')?.addEventListener('click', () => document.getElementById('addContactSheet').classList.add('hidden'));
  document.getElementById('addContactConfirm')?.addEventListener('click', () => {
    const name = document.getElementById('newContactName').value.trim();
    const persona = document.getElementById('newContactPersona').value.trim();
    if (!name) { alert('请输入昵称'); return; }
    const contact = { id: Date.now(), name, persona, avatar: null, wordCardMode: 'global', customWordCards: [], callMedia: null, callMediaType: null };
    state.contacts.push(contact); state.chats[String(contact.id)] = [];
    persist();
    document.getElementById('newContactName').value = ''; document.getElementById('newContactPersona').value = '';
    document.getElementById('addContactSheet').classList.add('hidden');
    renderChatList(); renderContactList(); openChat(String(contact.id));
  });
}
function openAddGroupSheet() {
  const box = document.getElementById('groupMemberChecklist');
  box.innerHTML = state.contacts.map(c => `<div class="wc-item"><label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" value="${c.id}" class="group-member-check"> ${escapeHtml(c.name)}</label></div>`).join('') || '<div style="padding:10px;color:#999;">还没有角色，请先添加角色</div>';
  document.getElementById('addGroupSheet').classList.remove('hidden');
}
function bindAddGroup() {
  document.getElementById('addGroupCancel')?.addEventListener('click', () => document.getElementById('addGroupSheet').classList.add('hidden'));
  document.getElementById('addGroupConfirm')?.addEventListener('click', () => {
    const name = document.getElementById('newGroupName').value.trim();
    const memberIds = [...document.querySelectorAll('.group-member-check:checked')].map(el => Number(el.value));
    if (!name || !memberIds.length) { alert('请输入群名并至少选一个成员'); return; }
    const group = { id: Date.now(), name, memberIds };
    state.groups.push(group);
    const chatId = 'g_' + group.id;
    state.chats[chatId] = [];
    persist();
    document.getElementById('newGroupName').value = '';
    document.getElementById('addGroupSheet').classList.add('hidden');
    renderChatList(); openChat(chatId);
  });
}

/* ============ 聊天设置 ============ */
let chatSettingsTarget = null;
function openChatSettings() {
  const chatId = state.activeChatId;
  if (!chatId) return;
  const body = document.getElementById('chatSettingsBody');
  if (isGroupChat(chatId)) {
    chatSettingsTarget = { type: 'group', id: chatId.slice(2) };
    const g = getGroupById(chatSettingsTarget.id);
    document.getElementById('chatSettingsTitle').textContent = '群聊设置';
    body.innerHTML = `<div class="settings-group-title">群成员</div>` + g.memberIds.map(id => {
      const c = getContactById(id); if (!c) return '';
      return `<div class="chat-item" style="border-radius:6px;">${avatarHtml(c.avatar, c.name, 40)}<div class="info"><div class="name">${escapeHtml(c.name)}</div></div></div>`;
    }).join('') + `<div class="sheet-btn cancel" id="deleteGroupBtn" style="margin-top:14px;">解散群聊</div>`;
  } else {
    chatSettingsTarget = { type: 'contact', id: chatId };
    const c = getContactById(chatId);
    if (!c) return;
    document.getElementById('chatSettingsTitle').textContent = '角色设置';
    body.innerHTML = `
      <div class="settings-group-title">直接设置头像（最稳定，一步到位）</div>
      <div class="direct-avatar-preview">${avatarHtml(c.avatar, c.name, 56)}<div class="menu-row" id="directSetAvatarBtn" style="border-bottom:none;flex:1;text-align:left;padding-left:4px;">点击选择照片直接设为头像</div></div>
      <input type="file" id="directAvatarFileInput" accept="image/*" class="hidden">
      <div class="settings-group-title">或从头像库自动挑选（点击指定）</div>
      <div class="avatar-grid" id="assignAvatarGrid" style="padding:0;">
        ${state.avatarLibrary.map(a => `<div class="avatar-lib-item" data-avatar-id="${a.id}"><img src="${a.dataUrl}"></div>`).join('') || '<div style="grid-column:1/-1;color:#999;font-size:13px;">头像库为空，请到 我→头像库管理 上传</div>'}
      </div>
      <div class="settings-group-title">视频通话形象（图片或视频，可选）</div>
      <div id="callMediaPreview" style="margin-bottom:8px;">${c.callMedia ? (c.callMediaType==='video' ? `<video src="${c.callMedia}" style="width:100px;height:130px;object-fit:cover;border-radius:8px;" muted loop autoplay playsinline></video>` : `<img src="${c.callMedia}" style="width:100px;height:130px;object-fit:cover;border-radius:8px;">`) : '<div style="color:#999;font-size:13px;">未设置，通话时将显示头像</div>'}</div>
      <input type="file" id="callMediaFileInput" accept="image/*,video/*" class="hidden">
      <div class="menu-row" id="uploadCallMediaBtn">上传通话形象</div>
      ${c.callMedia ? '<div class="menu-row" id="removeCallMediaBtn" style="color:#fa5151;">移除通话形象</div>' : ''}
      <div class="settings-group-title">角色设定</div>
      <textarea id="editPersona" rows="3" style="width:100%;border:1px solid #ddd;border-radius:6px;padding:8px;">${escapeHtml(c.persona || '')}</textarea>
      <div class="settings-group-title">字卡来源</div>
      <div class="form-row"><label>叠加专属字卡（在全局字卡基础上）</label><label class="switch"><input type="checkbox" id="editWordCardMode" ${c.wordCardMode === 'custom' ? 'checked' : ''}><span class="slider"></span></label></div>
      <div class="menu-row" id="editContactCustomCards">编辑专属字卡</div>
      <button class="save-btn" id="savePersonaBtn">保存</button>`;
  }
  document.getElementById('chatSettingsSheet').classList.remove('hidden');
}
function bindChatSettingsDelegation() {
  const body = document.getElementById('chatSettingsBody');
  if (!body) return;
  body.addEventListener('click', e => {
    if (!chatSettingsTarget) return;
    if (e.target.closest('#directSetAvatarBtn') && chatSettingsTarget.type === 'contact') { document.getElementById('directAvatarFileInput').click(); return; }
    const avatarItem = e.target.closest('[data-avatar-id]');
    if (avatarItem && chatSettingsTarget.type === 'contact') {
      const a = state.avatarLibrary.find(x => String(x.id) === avatarItem.dataset.avatarId);
      if (a) { directSetContactAvatar(chatSettingsTarget.id, a.dataUrl); openChatSettings(); }
      return;
    }
    if (e.target.closest('#uploadCallMediaBtn') && chatSettingsTarget.type === 'contact') { document.getElementById('callMediaFileInput').click(); return; }
    if (e.target.closest('#removeCallMediaBtn') && chatSettingsTarget.type === 'contact') {
      const c = getContactById(chatSettingsTarget.id);
      if (c) { c.callMedia = null; c.callMediaType = null; persist(); }
      openChatSettings();
      return;
    }
    if (e.target.closest('#editContactCustomCards') && chatSettingsTarget.type === 'contact') { openWordCardSheet(String(chatSettingsTarget.id)); return; }
    if (e.target.closest('#savePersonaBtn') && chatSettingsTarget.type === 'contact') {
      const c = getContactById(chatSettingsTarget.id);
      if (c) {
        c.persona = document.getElementById('editPersona').value.trim();
        c.wordCardMode = document.getElementById('editWordCardMode').checked ? 'custom' : 'global';
        persist();
      }
      alert('已保存');
      document.getElementById('chatSettingsSheet').classList.add('hidden');
      return;
    }
    if (e.target.closest('#deleteGroupBtn') && chatSettingsTarget.type === 'group') {
      const g = getGroupById(chatSettingsTarget.id);
      if (g && confirm(`确定解散群聊「${g.name}」？`)) {
        state.groups = state.groups.filter(x => x.id !== g.id);
        delete state.chats['g_' + g.id];
        persist();
        document.getElementById('chatSettingsSheet').classList.add('hidden');
        popPage();
        renderChatList();
      }
      return;
    }
  });
  body.addEventListener('change', e => {
    if (!chatSettingsTarget || chatSettingsTarget.type !== 'contact') return;
    if (e.target.id === 'directAvatarFileInput') {
      const file = e.target.files[0]; if (!file) return;
      e.target.value = '';
      readImageFileCompressed(file).then(dataUrl => { directSetContactAvatar(chatSettingsTarget.id, dataUrl); openChatSettings(); });
      return;
    }
    if (e.target.id === 'callMediaFileInput') {
      const file = e.target.files[0]; if (!file) return;
      const isVideo = file.type.startsWith('video/');
      if (file.size > 8 * 1024 * 1024) { if (!confirm('文件较大，可能导致存储空间超限，是否继续？')) { e.target.value=''; return; } }
      const reader = new FileReader();
      reader.onload = ev => {
        const c = getContactById(chatSettingsTarget.id);
        if (c) { c.callMedia = ev.target.result; c.callMediaType = isVideo ? 'video' : 'image'; persist(); }
        openChatSettings();
      };
      reader.readAsDataURL(file);
      e.target.value = '';
      return;
    }
  });
}

/* ============ 头像库管理页 ============ */
function renderAvatarLibGrid() {
  const grid = document.getElementById('avatarLibGrid'); if (!grid) return;
  grid.innerHTML = state.avatarLibrary.map(a => `<div class="avatar-lib-item" data-id="${a.id}"><img src="${a.dataUrl}"><div class="del-x" data-del="${a.id}">×</div><input placeholder="标签(如:开心)" value="${escapeHtml(a.tag || '')}" data-tag="${a.id}"></div>`).join('') || '<div style="grid-column:1/-1;color:#999;text-align:center;padding:30px;">还没有头像，点右上角 + 添加</div>';
}
function bindAvatarLib() {
  document.getElementById('rowAvatarLib')?.addEventListener('click', () => { renderAvatarLibGrid(); pushPage('page-avatarlib'); });
  document.getElementById('backFromAvatarLib')?.addEventListener('click', () => popPage());
  document.getElementById('btnAddAvatarImg')?.addEventListener('click', () => document.getElementById('avatarLibFileInput').click());
  document.getElementById('avatarLibFileInput')?.addEventListener('change', e => {
    const files = [...e.target.files];
    e.target.value = '';
    files.forEach(file => {
      readImageFileCompressed(file).then(dataUrl => {
        state.avatarLibrary.push({ id: Date.now()+Math.random(), dataUrl, tag: '' });
        persist(); renderAvatarLibGrid();
      });
    });
  });
  document.getElementById('avatarLibGrid')?.addEventListener('click', e => {
    const del = e.target.closest('[data-del]');
    if (del) { state.avatarLibrary = state.avatarLibrary.filter(a => String(a.id) !== del.dataset.del); persist(); renderAvatarLibGrid(); }
  });
  document.getElementById('avatarLibGrid')?.addEventListener('change', e => {
    const tagInput = e.target.closest('[data-tag]'); if (!tagInput) return;
    const a = state.avatarLibrary.find(x => String(x.id) === tagInput.dataset.tag);
    if (a) { a.tag = tagInput.value.trim(); persist(); }
  });
}

function bindMyAvatarUpload() {
  document.getElementById('myAvatarFileInput')?.addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    e.target.value = '';
    readImageFileCompressed(file).then(dataUrl => {
      state.myAvatar = dataUrl;
      persist(); renderMePage(); renderMessages(); renderMomentsProfile();
    });
  });
}

/* ============ 钱包（初始9999, 只能靠红包/转账增加, 充值每日限1000） ============ */
function renderWalletPage() {
  const w = getWallet();
  document.getElementById('walletBalanceAmount').textContent = `¥${w.balance.toFixed(2)}`;
  const today = new Date().toISOString().slice(0,10);
  const rechargedToday = (w.rechargeToday && w.rechargeToday.date === today) ? w.rechargeToday.amount : 0;
  document.getElementById('walletRechargeQuota').textContent = `今日可充值额度：¥${Math.max(0, 1000 - rechargedToday).toFixed(2)} / ¥1000.00`;
  const list = document.getElementById('walletTxList');
  list.innerHTML = w.transactions.slice().reverse().map(t => `
    <div class="wallet-tx-item">
      <div class="tx-info"><div class="tx-title">${escapeHtml(t.title)}</div><div class="tx-time">${new Date(t.ts).toLocaleString()}</div></div>
      <div class="wallet-tx-amount">${t.amount >= 0 ? '+' : ''}¥${t.amount.toFixed(2)}</div>
    </div>`).join('') || '<div style="padding:30px;text-align:center;color:#999;font-size:14px;">暂无交易记录</div>';
}
let _walletActionBusy = false;
function bindWallet() {
  document.getElementById('rowWallet')?.addEventListener('click', () => { renderWalletPage(); pushPage('page-wallet'); });
  document.getElementById('backFromWallet')?.addEventListener('click', () => popPage());
  document.getElementById('btnRechargeOpen')?.addEventListener('click', () => {
    document.getElementById('rechargeAmountInput').value = '';
    document.getElementById('rechargeSheet').classList.remove('hidden');
  });
  document.getElementById('rechargeCancel')?.addEventListener('click', () => document.getElementById('rechargeSheet').classList.add('hidden'));
  document.getElementById('rechargeNext')?.addEventListener('click', () => {
    if (_walletActionBusy) return;
    const amount = parseFloat(document.getElementById('rechargeAmountInput').value);
    if (!amount || amount <= 0) { alert('请输入有效金额'); return; }
    const today = new Date().toISOString().slice(0,10);
    const w = getWallet();
    if (!w.rechargeToday || w.rechargeToday.date !== today) w.rechargeToday = { date: today, amount: 0 };
    if (w.rechargeToday.amount + amount > 1000) {
      alert(`今日充值额度剩余 ¥${(1000 - w.rechargeToday.amount).toFixed(2)}，超出每日1000元限额`);
      return;
    }
    _walletActionBusy = true;
    document.getElementById('rechargeSheet').classList.add('hidden');
    runFaceIdSimulation(() => {
      const w2 = getWallet();
      if (!w2.rechargeToday || w2.rechargeToday.date !== today) w2.rechargeToday = { date: today, amount: 0 };
      w2.balance += amount;
      w2.rechargeToday.amount += amount;
      w2.transactions.push({ title:'充值（模拟，非真实支付）', amount, ts:Date.now() });
      saveWallet(w2);
      renderWalletPage();
      alert('充值成功（模拟效果）');
      _walletActionBusy = false;
    });
  });
  document.getElementById('btnWithdrawOpen')?.addEventListener('click', () => {
    if (_walletActionBusy) return;
    const w = getWallet();
    if (w.balance <= 0) { alert('余额不足'); return; }
    _walletActionBusy = true;
    runFaceIdSimulation(() => {
      const w2 = getWallet();
      w2.transactions.push({ title: '提现（模拟）', amount: -w2.balance, ts: Date.now() });
      w2.balance = 0;
      saveWallet(w2);
      renderWalletPage();
      _walletActionBusy = false;
      alert('提现成功（模拟效果）');
    });
  });
}

/* ============ 小程式：角色奶茶点单 ============ */
const TEA_MENU = [
  {name:'珍珠奶茶', price:15}, {name:'四季春奶绿', price:12}, {name:'芋泥啵啵', price:18},
  {name:'烤黑糖鲜奶', price:16}, {name:'茉莉花茶', price:10}
];
let _teaDraft = { contactId:null, drinkIndex:null, method:'pickup', address:'' };
let _teaTrackTimers = [];

function bindMiniPrograms() {
  document.getElementById('rowMiniPrograms')?.addEventListener('click', () => pushPage('page-miniprograms'));
  document.getElementById('backFromMiniPrograms')?.addEventListener('click', () => popPage());
  document.getElementById('miniAppTea')?.addEventListener('click', () => openTeaOrder());
}
function openTeaOrder() {
  _teaDraft = { contactId:null, drinkIndex:null, method:'pickup', address: safeGetItem(TEA_ADDRESS_KEY, '') || '' };
  document.getElementById('teaOrderForm').classList.remove('hidden');
  document.getElementById('teaOrderTracking').classList.add('hidden');
  document.getElementById('teaBottomBar').classList.remove('hidden');
  document.getElementById('teaAddressInput').value = _teaDraft.address;
  document.querySelectorAll('.tea-method-chip').forEach(c => c.classList.toggle('selected', c.dataset.method === 'pickup'));
  document.getElementById('teaAddressWrap').classList.add('hidden');
  const contactBox = document.getElementById('teaContactList');
  contactBox.innerHTML = state.contacts.map(c => `<div class="tea-contact-item" data-cid="${c.id}"><span>${escapeHtml(c.name)}</span></div>`).join('') || '<div style="color:#999;font-size:13px;padding:10px;">还没有角色，请先添加角色</div>';
  const menuBox = document.getElementById('teaMenuList');
  menuBox.innerHTML = TEA_MENU.map((d,i) => `<div class="tea-menu-item" data-idx="${i}"><span class="tea-name">${d.name}</span><span class="tea-price">¥${d.price}</span></div>`).join('');
  updateTeaTotal();
  pushPage('page-teaorder');
}
function updateTeaTotal() {
  let total = 0;
  if (_teaDraft.drinkIndex !== null) total += TEA_MENU[_teaDraft.drinkIndex].price;
  if (_teaDraft.method === 'delivery') total += 3;
  document.getElementById('teaTotalAmount').textContent = `¥${total.toFixed(2)}`;
  return total;
}
function bindTeaOrder() {
  document.getElementById('backFromTeaOrder')?.addEventListener('click', () => popPage());
  document.getElementById('teaContactList')?.addEventListener('click', e => {
    const item = e.target.closest('[data-cid]'); if (!item) return;
    _teaDraft.contactId = item.dataset.cid;
    document.querySelectorAll('.tea-contact-item').forEach(x => x.classList.toggle('selected', x === item));
  });
  document.getElementById('teaMenuList')?.addEventListener('click', e => {
    const item = e.target.closest('[data-idx]'); if (!item) return;
    _teaDraft.drinkIndex = Number(item.dataset.idx);
    document.querySelectorAll('.tea-menu-item').forEach(x => x.classList.toggle('selected', x === item));
    updateTeaTotal();
  });
  document.getElementById('teaMethodRow')?.addEventListener('click', e => {
    const chip = e.target.closest('[data-method]'); if (!chip) return;
    _teaDraft.method = chip.dataset.method;
    document.querySelectorAll('.tea-method-chip').forEach(c => c.classList.toggle('selected', c === chip));
    document.getElementById('teaAddressWrap').classList.toggle('hidden', _teaDraft.method !== 'delivery');
    updateTeaTotal();
  });
  document.getElementById('teaGoPayBtn')?.addEventListener('click', () => {
    if (!_teaDraft.contactId) { alert('请选择送给谁'); return; }
    if (_teaDraft.drinkIndex === null) { alert('请选择饮品'); return; }
    if (_teaDraft.method === 'delivery') {
      _teaDraft.address = document.getElementById('teaAddressInput').value.trim();
      if (!_teaDraft.address) { alert('请填写配送地址'); return; }
      safeSetItem(TEA_ADDRESS_KEY, _teaDraft.address);
    }
    const total = updateTeaTotal();
    document.getElementById('teaPayAmount').textContent = `¥${total.toFixed(2)}`;
    document.getElementById('teaPayCurrentBalance').textContent = `¥${getWallet().balance.toFixed(2)}`;
    pushPage('page-teapay');
  });
  document.getElementById('backFromTeaPay')?.addEventListener('click', () => popPage());
  document.getElementById('teaConfirmPayBtn')?.addEventListener('click', () => {
    if (_walletActionBusy) return;
    const total = updateTeaTotal();
    const w = getWallet();
    if (w.balance < total) { alert('余额不足，请先充值'); return; }
    _walletActionBusy = true;
    runFaceIdSimulation(() => {
      const w2 = getWallet();
      if (w2.balance < total) { _walletActionBusy = false; alert('余额不足，请先充值'); popPage(); return; }
      w2.balance -= total;
      const drinkName = TEA_MENU[_teaDraft.drinkIndex].name;
      w2.transactions.push({ title: `奶茶订单-${drinkName}`, amount: -total, ts: Date.now() });
      saveWallet(w2);
      _walletActionBusy = false;
      popPage();
      startTeaTracking(drinkName);
    });
  });
  document.getElementById('teaOrderAgainBtn')?.addEventListener('click', () => openTeaOrder());
}
function startTeaTracking(drinkName) {
  document.getElementById('teaOrderForm').classList.add('hidden');
  document.getElementById('teaBottomBar').classList.add('hidden');
  document.getElementById('teaOrderTracking').classList.remove('hidden');
  const steps = ['已下单', '制作中', _teaDraft.method === 'delivery' ? '派送中' : '取餐中', '已完成'];
  const stepsBox = document.getElementById('teaTrackSteps');
  function renderSteps(activeIdx) {
    stepsBox.innerHTML = steps.map((s,i) => `<div class="tea-track-step ${i<activeIdx?'done':''} ${i===activeIdx?'active':''}"><div class="tea-track-dot"></div><div class="tea-track-label">${s}</div></div>`).join('');
  }
  renderSteps(0);
  _teaTrackTimers.forEach(t => clearTimeout(t));
  _teaTrackTimers = [];
  _teaTrackTimers.push(setTimeout(() => renderSteps(1), 2500));
  _teaTrackTimers.push(setTimeout(() => renderSteps(2), 5000));
  _teaTrackTimers.push(setTimeout(async () => {
    renderSteps(3);
    const contactId = _teaDraft.contactId;
    const contact = getContactById(contactId);
    if (contact) {
      await replyWithTarot(String(contactId), String(contactId), `(我送的奶茶「${drinkName}」到了，请开心地表达感谢)`, contact.persona);
    }
  }, 8000));
}

/* ============ 导出 / 导入 ============ */
function exportData() {
  const data = {
    contacts: state.contacts, groups: state.groups, chats: state.chats, moments: state.moments,
    avatarLibrary: state.avatarLibrary, myAvatar: state.myAvatar, myName: state.myName,
    chatBg: state.chatBg, momentsCover: state.momentsCover,
    wordCards: WordCards.getAll(), stickers: getStickers(), aiConfig: getAIConfig(), exportedAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `塔罗对话备份_${Date.now()}.json`; a.click();
  URL.revokeObjectURL(url);
}
function importData(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.contacts) state.contacts = data.contacts;
      if (data.groups) state.groups = data.groups;
      if (data.chats) state.chats = data.chats;
      if (data.moments) state.moments = data.moments;
      if (data.avatarLibrary) state.avatarLibrary = data.avatarLibrary;
      if (data.myAvatar) state.myAvatar = data.myAvatar;
      if (data.myName) state.myName = data.myName;
      if (data.chatBg) state.chatBg = data.chatBg;
      if (data.momentsCover) state.momentsCover = data.momentsCover;
      if (data.wordCards) WordCards.save(data.wordCards);
      if (data.stickers) saveStickers(data.stickers);
      if (data.aiConfig) saveAIConfig(data.aiConfig);
      persist();
      alert('导入成功，即将刷新页面'); location.reload();
    } catch (err) { alert('文件格式有误: ' + err.message); }
  };
  reader.readAsText(file);
}
function bindExportImport() {
  document.getElementById('rowExport')?.addEventListener('click', exportData);
  document.getElementById('rowImport')?.addEventListener('click', () => document.getElementById('importFileInput').click());
  document.getElementById('importFileInput')?.addEventListener('change', e => { if (e.target.files[0]) importData(e.target.files[0]); });
}

/* ============ 导航按钮 ============ */
function bindNavButtons() {
  document.getElementById('backFromChat')?.addEventListener('click', () => popPage());
  document.getElementById('backFromMoments')?.addEventListener('click', () => popPage());
  document.getElementById('backFromSettings')?.addEventListener('click', () => popPage());
  document.getElementById('rowMoments')?.addEventListener('click', () => { renderMoments(); renderMomentsProfile(); pushPage('page-moments'); });
  document.getElementById('rowSettings')?.addEventListener('click', () => { loadSettingsForm(); pushPage('page-settings'); });
  document.getElementById('btnChatSettings')?.addEventListener('click', openChatSettings);
  document.getElementById('chatSettingsClose')?.addEventListener('click', () => document.getElementById('chatSettingsSheet').classList.add('hidden'));
  document.getElementById('rpDetailClose')?.addEventListener('click', () => document.getElementById('redPacketOpenSheet').classList.add('hidden'));
}

/* ============ 设置表单 ============ */
function loadCloudSettingsForm() {
  const cfg = getCloudConfig();
  document.getElementById('cfgCloudEnabled').checked = cfg.enabled;
  document.getElementById('cfgRoomId').value = cfg.roomId;
}
function saveCurrentCloudForm() { saveCloudConfig({ enabled: document.getElementById('cfgCloudEnabled').checked, roomId: document.getElementById('cfgRoomId').value.trim() }); }
function bindCloudSync() {
  document.getElementById('cloudUploadBtn')?.addEventListener('click', async () => {
    saveCurrentCloudForm();
    const ok = await cloudUpload({ contacts: state.contacts, groups: state.groups, chats: state.chats, moments: state.moments, avatarLibrary: state.avatarLibrary, myAvatar: state.myAvatar, myName: state.myName, chatBg: state.chatBg, momentsCover: state.momentsCover, wordCards: WordCards.getAll(), stickers: getStickers() });
    alert(ok ? '已上传到云端' : '上传失败，请检查房间ID是否已填写、开关是否已打开');
  });
  document.getElementById('cloudDownloadBtn')?.addEventListener('click', async () => {
    saveCurrentCloudForm();
    await tryCloudLoadOnStartup();
    alert('已从云端下载并覆盖本地数据，即将刷新');
    location.reload();
  });
}
function loadSettingsForm() {
  const cfg = getAIConfig();
  document.getElementById('cfgTextEnabled').checked = cfg.textEnabled;
  document.getElementById('cfgEndpoint').value = cfg.endpoint;
  document.getElementById('cfgApiKey').value = cfg.apiKey;
  document.getElementById('cfgModel').value = cfg.model;
  document.getElementById('cfgVoiceEnabled').checked = cfg.voiceEnabled;
  document.getElementById('cfgVoiceEndpoint').value = cfg.voiceEndpoint;
  document.getElementById('cfgVoiceApiKey').value = cfg.voiceApiKey;
  document.getElementById('cfgVoiceModel').value = cfg.voiceModel;
  document.getElementById('cfgVoiceName').value = cfg.voiceName;
  document.getElementById('cfgAutoMsg').checked = cfg.autoMsg;
  document.getElementById('cfgAutoMoment').checked = cfg.autoMoment;
  document.getElementById('cfgAutoAvatar').checked = cfg.autoAvatar;
  document.getElementById('cfgAutoRedpacket').checked = cfg.autoRedpacket;
  loadCloudSettingsForm();
}
function bindSettingsSave() {
  document.getElementById('saveSettingsBtn')?.addEventListener('click', () => {
    saveAIConfig({
      textEnabled: document.getElementById('cfgTextEnabled').checked,
      endpoint: document.getElementById('cfgEndpoint').value.trim(),
      apiKey: document.getElementById('cfgApiKey').value.trim(),
      model: document.getElementById('cfgModel').value.trim(),
      voiceEnabled: document.getElementById('cfgVoiceEnabled').checked,
      voiceEndpoint: document.getElementById('cfgVoiceEndpoint').value.trim(),
      voiceApiKey: document.getElementById('cfgVoiceApiKey').value.trim(),
      voiceModel: document.getElementById('cfgVoiceModel').value.trim(),
      voiceName: document.getElementById('cfgVoiceName').value,
      autoMsg: document.getElementById('cfgAutoMsg').checked,
      autoMoment: document.getElementById('cfgAutoMoment').checked,
      autoAvatar: document.getElementById('cfgAutoAvatar').checked,
      autoRedpacket: document.getElementById('cfgAutoRedpacket').checked
    });
    saveCurrentCloudForm();
    alert('已保存');
  });
}

/* ============ 输入框 & 语音输入 ============ */
const MIC_TOGGLE_ICON = '<circle cx="12" cy="12" r="10" fill="none" stroke="#666" stroke-width="1.6"/><path d="M12 7a2.2 2.2 0 0 1 2.2 2.2v3.6a2.2 2.2 0 0 1-4.4 0V9.2A2.2 2.2 0 0 1 12 7z" fill="#666"/><path d="M8.5 12.5a3.5 3.5 0 0 0 7 0" fill="none" stroke="#666" stroke-width="1.4" stroke-linecap="round"/>';
const KEYBOARD_TOGGLE_ICON = '<circle cx="12" cy="12" r="10" fill="none" stroke="#666" stroke-width="1.6"/><rect x="6.5" y="9" width="11" height="7" rx="1.3" fill="none" stroke="#666" stroke-width="1.4"/><circle cx="9" cy="12.2" r=".6" fill="#666"/><circle cx="12" cy="12.2" r=".6" fill="#666"/><circle cx="15" cy="12.2" r=".6" fill="#666"/><rect x="8.3" y="13.6" width="7.4" height="1" rx=".5" fill="#666"/>';
function bindInputBar() {
  const msgInput = document.getElementById('msgInput');
  const holdBtn = document.getElementById('holdTalkBtn');
  const micBtn = document.getElementById('micBtn');
  const emojiBtn = document.getElementById('btnEmoji');
  const moreBtn = document.getElementById('btnMore');
  const sendBtn = document.getElementById('btnSend');
  if (!msgInput || !holdBtn || !micBtn || !moreBtn || !sendBtn) return;
  function toggleSendBtn() { const hasText = msgInput.value.trim().length > 0; sendBtn.classList.toggle('hidden', !hasText); moreBtn.classList.toggle('hidden', hasText); }
  function doSend() { if (!msgInput.value.trim()) return; handleSend(msgInput.value); msgInput.value = ''; toggleSendBtn(); }
  msgInput.addEventListener('input', toggleSendBtn);
  msgInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSend(); });
  msgInput.addEventListener('focus', () => document.getElementById('plusPanelInline')?.classList.add('hidden'));
  sendBtn.addEventListener('click', doSend);
  emojiBtn?.addEventListener('click', () => {
    document.getElementById('plusPanelInline')?.classList.add('hidden');
    renderStickerGrid();
    document.getElementById('stickerPickerSheet')?.classList.remove('hidden');
  });
  micBtn.addEventListener('click', () => {
    const enteringVoiceMode = !msgInput.classList.contains('hidden');
    msgInput.classList.toggle('hidden', enteringVoiceMode);
    holdBtn.classList.toggle('hidden', !enteringVoiceMode);
    document.getElementById('plusPanelInline')?.classList.add('hidden');
    micBtn.innerHTML = enteringVoiceMode ? KEYBOARD_TOGGLE_ICON : MIC_TOGGLE_ICON;
    if (enteringVoiceMode) sendBtn.classList.add('hidden');
    else toggleSendBtn();
  });
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognizer = null;
  if (SR) {
    recognizer = new SR(); recognizer.lang = 'zh-CN'; recognizer.continuous = false;
    recognizer.onresult = ev => { const text = ev.results[0][0].transcript; if (text) handleSend(text); };
    recognizer.onerror = () => holdBtn.classList.remove('active');
    recognizer.onend = () => holdBtn.classList.remove('active');
  }
  holdBtn.addEventListener('pointerdown', () => { holdBtn.classList.add('active'); if (recognizer) { try { recognizer.start(); } catch(e){} } });
  const stopTalk = () => { holdBtn.classList.remove('active'); if (recognizer) { try { recognizer.stop(); } catch(e){} } else alert('当前浏览器不支持语音识别，请切换回文字输入'); };
  holdBtn.addEventListener('pointerup', stopTalk);
  holdBtn.addEventListener('pointerleave', stopTalk);
}

/* ============ 初始化 ============ */
function safeStep(name, fn) { try { fn(); } catch (e) { console.error(`[初始化失败: ${name}]`, e); } }
async function safeStepAsync(name, fn) { try { await fn(); } catch (e) { console.error(`[初始化失败: ${name}]`, e); } }

async function migrateOversizedAvatars() {
  const THRESHOLD = 60000; // large uncompressed photos crash mobile Safari once repeated across many message bubbles
  let changed = false;
  if (state.myAvatar && state.myAvatar.length > THRESHOLD) { state.myAvatar = await resizeImageDataUrl(state.myAvatar); changed = true; }
  for (const c of state.contacts) {
    if (c.avatar && c.avatar.length > THRESHOLD) { c.avatar = await resizeImageDataUrl(c.avatar); changed = true; }
  }
  for (const a of state.avatarLibrary) {
    if (a.dataUrl && a.dataUrl.length > THRESHOLD) { a.dataUrl = await resizeImageDataUrl(a.dataUrl); changed = true; }
  }
  if (changed) persist();
}
async function init() {
  await safeStepAsync('tryCloudLoadOnStartup', tryCloudLoadOnStartup);
  await safeStepAsync('migrateOversizedAvatars', migrateOversizedAvatars);
  safeStep('renderTabBars', renderTabBars);
  safeStep('renderMePage', renderMePage);
  safeStep('renderChatList', renderChatList);
  safeStep('renderContactList', renderContactList);
  safeStep('renderMoments', renderMoments);
  safeStep('renderMomentsProfile', renderMomentsProfile);
  safeStep('bindListDelegation-chat', () => bindListDelegation('chatListItems'));
  safeStep('bindListDelegation-contacts', () => bindListDelegation('contactListItems'));
  safeStep('bindMsgListDelegation', bindMsgListDelegation);
  safeStep('bindMomentsDelegation', bindMomentsDelegation);
  safeStep('bindMomentsProfile', bindMomentsProfile);
  safeStep('bindMomentDetailPage', bindMomentDetailPage);
  safeStep('bindDiscoverPlaceholders', bindDiscoverPlaceholders);
  safeStep('bindSheetClose', bindSheetClose);
  safeStep('bindWordCardSheet', bindWordCardSheet);
  safeStep('bindPlusPanel', bindPlusPanel);
  safeStep('bindStickerPicker', bindStickerPicker);
  safeStep('bindCallOverlay', bindCallOverlay);
  safeStep('bindLocationPicker', bindLocationPicker);
  safeStep('bindViewLocation', bindViewLocation);
  safeStep('bindCallLogView', bindCallLogView);
  safeStep('bindAddMenu', bindAddMenu);
  safeStep('bindAddContact', bindAddContact);
  safeStep('bindAddGroup', bindAddGroup);
  safeStep('bindNavButtons', bindNavButtons);
  safeStep('bindSettingsSave', bindSettingsSave);
  safeStep('bindInputBar', bindInputBar);
  safeStep('bindRedPacket', bindRedPacket);
  safeStep('bindSendOptions', bindSendOptions);
  safeStep('bindAvatarLib', bindAvatarLib);
  safeStep('bindMyAvatarUpload', bindMyAvatarUpload);
  safeStep('bindExportImport', bindExportImport);
  safeStep('bindEditName', bindEditName);
  safeStep('bindChatBackground', bindChatBackground);
  safeStep('bindChatSettingsDelegation', bindChatSettingsDelegation);
  safeStep('bindSwipeBack', bindSwipeBack);
  safeStep('bindCloudSync', bindCloudSync);
  safeStep('bindPostMoment', bindPostMoment);
  safeStep('bindWallet', bindWallet);
  safeStep('bindMiniPrograms', bindMiniPrograms);
  safeStep('bindTeaOrder', bindTeaOrder);
  safeStep('bindChatItemActionSheet', bindChatItemActionSheet);
  safeStep('showPage', () => showPage('page-chatlist'));
}

document.addEventListener('DOMContentLoaded', init);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW注册失败', e));
  });
}
