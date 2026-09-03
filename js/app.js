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

/* ============ 朋友圈：纯AI自由文本生成（不使用字卡） ============ */
const MOMENT_FALLBACK_PHRASES = ["开完会才发现咖啡一口没动。","今天的晚霞只出现了几分钟。","绕了点路，意外买到刚出炉的面包。","把拖了很久的事做完了，舒服。","外面风很大，回家再说。","这个时间的街上居然还挺热闹。","最近在循环同一首歌。","冰块化得比我喝得快。","晚饭随便吃一点。","难得准时下班。"];

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
const LAST_GPS_KEY = 'tarot_last_gps_v1';

function getLastGps() {
  const gps = safeLoadJSON(LAST_GPS_KEY, null);
  return gps && Number.isFinite(Number(gps.lat)) && Number.isFinite(Number(gps.lng)) ? gps : null;
}
function saveLastGps(coords) {
  const gps = { lat: Number(coords.latitude), lng: Number(coords.longitude), accuracy: Number(coords.accuracy || 0), ts: Date.now() };
  safeSaveJSON(LAST_GPS_KEY, gps);
  return gps;
}
function requestCurrentGps() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('此设备不支持 GPS 定位')); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve(saveLastGps(pos.coords)),
      err => reject(new Error(err.code === 1 ? '定位权限未开启，请在浏览器设置中允许定位' : '暂时无法取得位置，请稍后再试')),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  });
}
function nearbyGps(base) {
  const distanceKm = 0.4 + secureRandomInt(2600) / 1000;
  const angle = secureRandomInt(360) * Math.PI / 180;
  const lat = Number(base.lat) + (distanceKm / 111) * Math.cos(angle);
  const lngScale = Math.max(0.2, Math.cos(Number(base.lat) * Math.PI / 180));
  const lng = Number(base.lng) + (distanceKm / (111 * lngScale)) * Math.sin(angle);
  return { lat, lng, accuracy: 30 + secureRandomInt(90), ts: Date.now() };
}
function staticMapUrl(lat,lng,width=460,height=256){
 lat=Number(lat);lng=Number(lng);
 return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat.toFixed(6)},${lng.toFixed(6)}&zoom=16&size=${width}x${height}&maptype=mapnik&markers=${lat.toFixed(6)},${lng.toFixed(6)},red-pushpin`;
}
async function reverseGeocode(lat,lng){
 try{const u=`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=18&addressdetails=1&accept-language=zh-Hant`;const r=await fetch(u,{headers:{'Accept-Language':'zh-Hant,zh;q=0.9'}});if(!r.ok)return null;const d=await r.json(),a=d.address||{},main=a.amenity||a.shop||a.building||a.road||a.pedestrian||a.neighbourhood||a.suburb,area=a.suburb||a.city_district||a.city||a.town||a.county;return [main,area].filter((v,i,x)=>v&&x.indexOf(v)===i).slice(0,2).join(' · ')||d.name||d.display_name?.split(',').slice(0,2).join(' · ')||null;}catch(_){return null;}
}
function externalMapUrl(lat,lng,label){return `https://maps.apple.com/?ll=${encodeURIComponent(Number(lat).toFixed(6)+','+Number(lng).toFixed(6))}&q=${encodeURIComponent(label||'位置')}`;}
function locationPreviewHtml(lat,lng){if(!Number.isFinite(Number(lat))||!Number.isFinite(Number(lng)))return '<div class="location-map-fallback">旧版位置</div>';return `<img class="location-map-frame" src="${staticMapUrl(lat,lng)}" loading="lazy" alt="位置地图"><div class="location-map-shield"></div>`;}


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
    if (m.recalled) {
      const recalledBy = m.from === 'me' ? '你' : (getContactById(m.from)?.name || '对方');
      return dividerHtml + `<div class="msg-system">${escapeHtml(recalledBy)}撤回了一条消息</div>`;
    }
    const isMe = m.from === 'me';
    const senderContact = !isMe ? getContactById(m.from) : null;
    const name = isMe ? (state.myName || '我') : (senderContact?.name || '角色');
    const avatarDataUrl = isMe ? state.myAvatar : (senderContact?.avatar || null);

    let bubbleHtml;
    if (m.type === 'redpacket') {
      bubbleHtml = `<div class="bubble redpacket ${m.redpacket.status}" data-redpacket="${m.id}"><div class="rp-main"><div class="rp-envelope"><span>¥</span></div><div class="rp-text"><div class="rp-note">${escapeHtml(m.redpacket.note)}</div><div class="rp-status">${m.redpacket.status==='claimed'?'红包已被领取':'领取红包'}</div></div></div><div class="rp-footer">微信红包</div></div>`;
    } else if (m.type === 'options') {
      bubbleHtml = `<div class="bubble options">
        <div class="options-title">请选择</div>
        <div class="options-list">
          ${m.options.map((o, i) => `<div class="option-row"><span class="opt-num">${i + 1}</span>${escapeHtml(o)}</div>`).join('')}
        </div>
      </div>`;
    } else if (m.type === 'image') {
      bubbleHtml = `<div class="bubble image"><img src="${m.image}" alt=""></div>`;
    } else if (m.type === 'location') {
      bubbleHtml = `<div class="bubble location" data-location="${m.id}">
        <div class="mini-map">${locationPreviewHtml(m.latitude, m.longitude)}</div>
        <div class="location-text"><strong>${escapeHtml(m.text || '位置')}</strong>${Number.isFinite(Number(m.latitude)) ? `<small>${Number(m.latitude).toFixed(5)}, ${Number(m.longitude).toFixed(5)}</small>` : ''}</div>
      </div>`;
    } else if (m.type === 'call') {
      const isVideo = m.callType === 'video';
      const hasLog = m.callChatLog && m.callChatLog.length;
      bubbleHtml = `<div class="bubble call" ${hasLog ? `data-calllog="${m.id}"` : ''}>
        <svg viewBox="0 0 24 24">${isVideo ? '<rect x="3" y="6" width="13" height="12" rx="2" fill="none" stroke="#0a0a0a" stroke-width="1.6"/><path d="M16 10l5-3v10l-5-3z" fill="none" stroke="#0a0a0a" stroke-width="1.6" stroke-linejoin="round"/>' : '<path d="M5 4c1 4 2 7 5 9s5 4 9 5l1-3c-2-1-3-2-5-3l-2 2c-2-1-4-3-5-5l2-2c-1-2-2-3-3-5z" fill="none" stroke="#0a0a0a" stroke-width="1.6" stroke-linejoin="round"/>'}</svg>
        <div class="call-bubble-text"><div>${isVideo ? '视频通话' : '语音通话'}</div><div class="call-bubble-duration">${m.callDurationText}</div></div>
      </div>`;
    } else if (m.voiceUrl) {
      bubbleHtml = `<div class="bubble voice" data-play="${m.id}"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="#07c160"/></svg><span>${m.durationSec || Math.max(1, Math.round((m.text || '').length / 4))}″</span></div>`;
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

let activeMessageActionId = null;
function openTarotSheet(msgId) {
  activeMessageActionId = String(msgId);
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
  const recallBtn = document.getElementById('messageRecallBtn');
  if (recallBtn) recallBtn.style.display = (!msg.recalled && msg.from === 'me') ? '' : 'none';
  document.getElementById('tarotSheet')?.classList.remove('hidden');
}
function recallActiveMessage() {
  const chatId = state.activeChatId;
  const msg = (state.chats[chatId] || []).find(m => String(m.id) === String(activeMessageActionId));
  if (!msg || msg.recalled || msg.from !== 'me') return;
  msg.recalled = true;
  msg.recalledAt = Date.now();
  persist();
  document.getElementById('tarotSheet')?.classList.add('hidden');
  renderMessages();
  renderChatList();
}
function bindMessageRecall() {
  document.getElementById('messageRecallBtn')?.addEventListener('click', recallActiveMessage);
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
  addMessage(chatId, 'me', text.trim());

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
function sendVoiceMessage(dataUrl, durationSec) {
  const chatId = state.activeChatId;
  if (!chatId) return;
  addMessage(chatId, 'me', '[语音]', { voiceUrl: dataUrl, durationSec });
  state.pendingBatch[chatId] = state.pendingBatch[chatId] || [];
  state.pendingBatch[chatId].push('(发来一条语音消息)');
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

/* ============ GPS 位置分享 ============ */
function sendLocationMessageManual(name, gps) {
  const chatId = state.activeChatId;
  if (!chatId || !gps) return;
  addMessage(chatId, 'me', name || '我的位置', {
    type: 'location', latitude: Number(gps.lat), longitude: Number(gps.lng), accuracy: Number(gps.accuracy || 0)
  });
}
async function contactShareLocation(contactId, chatId) {
  const contact = getContactById(contactId);
  if (!contact) return;
  let base = getLastGps();
  if (!base) {
    try { base = await requestCurrentGps(); }
    catch (_) { base = { lat: 22.3193, lng: 114.1694, accuracy: 100, ts: Date.now() }; }
  }
  const gps = nearbyGps(base);
  const place = await reverseGeocode(gps.lat,gps.lng);
  addMessage(chatId, contactId, place || `${contact.name || '对方'}的位置`, {
    type: 'location', latitude: gps.lat, longitude: gps.lng, accuracy: gps.accuracy
  });
}
function updateLocationPicker(gps) {
  const sheet = document.getElementById('locationPickerSheet');
  const status = document.getElementById('locationGpsStatus');
  const frame = document.getElementById('locationPickerMap');
  if (!sheet || !gps) return;
  sheet.dataset.lat = String(gps.lat);
  sheet.dataset.lng = String(gps.lng);
  sheet.dataset.accuracy = String(gps.accuracy || 0);
  if (frame) frame.src = staticMapUrl(gps.lat,gps.lng,620,360);
  if (status) status.textContent = gps.accuracy ? `已定位 · 误差约 ${Math.round(gps.accuracy)} 米` : '已定位';
}
async function locateForPicker() {
  const status = document.getElementById('locationGpsStatus');
  const btn = document.getElementById('locationGpsBtn');
  if (status) status.textContent = '正在取得 GPS 位置…';
  if (btn) btn.classList.add('disabled');
  try { const gps=await requestCurrentGps();updateLocationPicker(gps);const place=await reverseGeocode(gps.lat,gps.lng);if(place)document.getElementById('locationNameInput').value=place; }
  catch (err) { if (status) status.textContent = err.message || '无法取得位置'; }
  finally { if (btn) btn.classList.remove('disabled'); }
}
function openLocationPicker() {
  const sheet = document.getElementById('locationPickerSheet');
  if (!sheet) return;
  sheet.dataset.lat = ''; sheet.dataset.lng = ''; sheet.dataset.accuracy = '';
  document.getElementById('locationNameInput').value = '我的位置';
  document.getElementById('locationGpsStatus').textContent = '准备定位…';
  document.getElementById('locationPickerMap').removeAttribute('src');
  sheet.classList.remove('hidden');
  locateForPicker();
}
function bindLocationPicker() {
  const sheet = document.getElementById('locationPickerSheet');
  document.getElementById('locationGpsBtn')?.addEventListener('click', locateForPicker);
  document.getElementById('locationPickerCancel')?.addEventListener('click', () => sheet?.classList.add('hidden'));
  document.getElementById('locationPickerConfirm')?.addEventListener('click', () => {
    const latRaw = sheet?.dataset.lat, lngRaw = sheet?.dataset.lng;
    if (!latRaw || !lngRaw) { alert('请先允许 GPS 定位'); return; }
    const lat = Number(latRaw), lng = Number(lngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) { alert('定位坐标无效，请重新定位'); return; }
    const name = document.getElementById('locationNameInput').value.trim() || '我的位置';
    sendLocationMessageManual(name, { lat, lng, accuracy: Number(sheet.dataset.accuracy || 0) });
    sheet.classList.add('hidden');
  });
}
function openViewLocation(msgId) {
  const msg = (state.chats[state.activeChatId] || []).find(m => String(m.id) === String(msgId));
  if (!msg) return;
  const lat = Number(msg.latitude), lng = Number(msg.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) { alert('这是一条旧版位置消息，没有 GPS 坐标'); return; }
  document.getElementById('viewLocationTitle').textContent = msg.text || '位置';
  document.getElementById('viewLocationMap').src = staticMapUrl(lat,lng,620,360);
  const openBtn = document.getElementById('viewLocationOpenMaps');
  openBtn.dataset.url = externalMapUrl(lat, lng, msg.text || '位置');
  document.getElementById('viewLocationCoords').textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  document.getElementById('viewLocationSheet').classList.remove('hidden');
}
function bindViewLocation() {
  document.getElementById('viewLocationOpenMaps')?.addEventListener('click', e => {
    const url = e.currentTarget.dataset.url;
    if (url) window.open(url, '_blank', 'noopener');
  });
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
  const momentScenes = ['刚结束一天的工作，记录一个很小的瞬间','路上看到或遇到了一件具体的小事','分享刚吃过或正在喝的东西','晚上随手发一句不刻意煽情的话','周末的真实生活碎片'];
  const momentPlaces = ['', '', '', '公司', '回家路上', '附近'];
  const content = await generateFreeformMomentText(cards, contact.persona, momentScenes[secureRandomInt(momentScenes.length)] + '；不要鸡汤、不要问候大家、不要使用“今天也要加油”一类模板句');
  state.moments.unshift({ id: Date.now(), contactId: contact.id, name: contact.name, avatar: contact.avatar, content, image: null, cards, location: momentPlaces[secureRandomInt(momentPlaces.length)], likes: [], ts: Date.now(), comments: [] });
  persist(); renderMoments();
}
async function aiAutoChangeAvatar() {
  const cfg = getAIConfig();
  if (!cfg.autoAvatar || !state.contacts.length || !state.avatarLibrary.length) return;
  const contact = state.contacts[secureRandomInt(state.contacts.length)];
  await requestAvatarChange(String(contact.id), String(contact.id));
}
setInterval(() => { try { if (secureRandomInt(100) < 3) aiAutoSendMessage(); } catch(e){ console.error(e); } }, 60000);
setInterval(() => { try { if (secureRandomInt(100) < 2) aiAutoPostMoment(); } catch(e){ console.error(e); } }, 120000);
setInterval(() => { try { if (secureRandomInt(100) < 2) aiAutoChangeAvatar(); } catch(e){ console.error(e); } }, 150000);

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
  moment.likes = moment.likes || [];
  if (secureRandomInt(100) < 70 && !moment.likes.includes(String(contact.id))) moment.likes.push(String(contact.id));
  moment.comments.push({ from: contact.name, text, cards, contactId: contact.id });
  persist();
  renderMoments();
}

/* ============ 朋友圈展示：微信式点赞 / 评论操作 ============ */
function momentLikeName(id) {
  if (String(id) === 'me') return state.myName || '我';
  return getContactById(id)?.name || '';
}
function toggleMomentLike(momentId) {
  const m = state.moments.find(x => x.id === momentId);
  if (!m) return;
  m.likes = m.likes || [];
  const i = m.likes.map(String).indexOf('me');
  if (i >= 0) m.likes.splice(i, 1); else m.likes.push('me');
  persist(); renderMoments();
}
function deleteOwnMoment(momentId) {
  const m = state.moments.find(x => x.id === momentId);
  if (!m || m.contactId !== 'me') return;
  if (!confirm('删除这条朋友圈？')) return;
  state.moments = state.moments.filter(x => x.id !== momentId);
  persist(); renderMoments();
}
function renderMomentSocial(m) {
  const likes = (m.likes || []).map(momentLikeName).filter(Boolean);
  const comments = m.comments || [];
  if (!likes.length && !comments.length) return '';
  return `<div class="moment-social">
    ${likes.length ? `<div class="moment-likes"><span class="moment-heart">♡</span>${likes.map(escapeHtml).join('，')}</div>` : ''}
    ${comments.length ? `<div class="comment-list">${comments.map(c => `<div class="comment-line"><b>${escapeHtml(c.from === 'me' ? (state.myName || '我') : c.from)}</b><span>：${escapeHtml(c.text)}</span></div>`).join('')}</div>` : ''}
  </div>`;
}
function renderMoments() {
  const box = document.getElementById('momentsList');
  if (!box) return;
  const sorted = [...state.moments].sort((a,b) => (b.pinned?1:0)-(a.pinned?1:0) || b.ts-a.ts);
  box.innerHTML = sorted.map(m => {
    const liked = (m.likes || []).map(String).includes('me');
    return `<div class="moment-item" data-id="${m.id}">
      ${avatarHtml(m.avatar, m.name, 44)}
      <div class="moment-body">
        <div class="moment-header" data-detail="${m.id}">
          <div class="mname">${escapeHtml(m.name)}</div>
          ${m.content ? `<div class="content">${escapeHtml(m.content)}</div>` : ''}
          ${m.image ? `<img src="${m.image}" class="moment-image" loading="lazy">` : ''}
        </div>
        ${m.location ? `<div class="moment-location">${escapeHtml(m.location)}</div>` : ''}
        <div class="time-row">
          <span class="time">${formatMomentFeedTime(m.ts)}${m.contactId === 'me' ? `<button class="moment-delete" data-delete-moment="${m.id}">删除</button>` : ''}</span>
          <div class="moment-action-wrap">
            <button class="moment-action-trigger" data-moment-menu="${m.id}" aria-label="朋友圈操作">··</button>
            <div class="moment-action-menu hidden" data-moment-actions="${m.id}">
              <button data-like-moment="${m.id}"><span>♡</span>${liked ? '取消' : '赞'}</button>
              <button data-comment-moment="${m.id}"><span>◯</span>评论</button>
            </div>
          </div>
        </div>
        ${renderMomentSocial(m)}
        <div class="comment-input-row hidden" data-comment-row="${m.id}"><input placeholder="评论" data-comment-input="${m.id}"><button data-comment-submit="${m.id}">发送</button></div>
      </div>
    </div>`;
  }).join('') || '<div class="moments-empty">还没有动态</div>';
}
function bindMomentsDelegation() {
  const box = document.getElementById('momentsList');
  if (!box) return;
  box.addEventListener('click', e => {
    const menuBtn=e.target.closest('[data-moment-menu]');
    if(menuBtn){
      e.stopPropagation();
      const id=menuBtn.dataset.momentMenu;
      box.querySelectorAll('[data-moment-actions]').forEach(x=>x.classList.toggle('hidden',x.dataset.momentActions!==id||!x.classList.contains('hidden')));
      return;
    }
    const like=e.target.closest('[data-like-moment]');
    if(like){toggleMomentLike(Number(like.dataset.likeMoment));return;}
    const comment=e.target.closest('[data-comment-moment]');
    if(comment){
      const row=box.querySelector(`[data-comment-row="${comment.dataset.commentMoment}"]`);
      row?.classList.remove('hidden'); row?.querySelector('input')?.focus();
      box.querySelectorAll('[data-moment-actions]').forEach(x=>x.classList.add('hidden'));
      return;
    }
    const del=e.target.closest('[data-delete-moment]');
    if(del){deleteOwnMoment(Number(del.dataset.deleteMoment));return;}
    const submit=e.target.closest('[data-comment-submit]');
    if(submit){
      const id=Number(submit.dataset.commentSubmit), input=box.querySelector(`[data-comment-input="${id}"]`);
      if(input?.value.trim()){aiReplyToMoment(id,input.value.trim());input.value='';}
      return;
    }
    const detail=e.target.closest('[data-detail]');
    if(detail) openMomentDetail(Number(detail.dataset.detail));
  });
  document.addEventListener('click',e=>{if(!e.target.closest('.moment-action-wrap'))box.querySelectorAll('[data-moment-actions]').forEach(x=>x.classList.add('hidden'));});
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
    const moment = { id: Date.now(), contactId: 'me', name: state.myName || '我', avatar: state.myAvatar, content: text, image: _postMomentImage, location: '', likes: [], ts: Date.now(), comments: [] };
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

/* ============ 发送选项（2~8个，只会从用户提供的选项中作答） ============ */
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
  const idx = secureRandomInt(options.length);
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

/* ============ 微信红包 ============ */
function openSendRedPacket(){document.getElementById('rpAmount').value='';document.getElementById('rpNote').value='恭喜发财，大吉大利';document.getElementById('sendRedPacketSheet')?.classList.remove('hidden');}
function bindRedPacket(){
 document.getElementById('rpCancel')?.addEventListener('click',()=>document.getElementById('sendRedPacketSheet').classList.add('hidden'));
 document.getElementById('rpConfirm')?.addEventListener('click',()=>{const amount=Number(document.getElementById('rpAmount').value),note=document.getElementById('rpNote').value.trim()||'恭喜发财，大吉大利';if(!Number.isFinite(amount)||amount<.01||amount>200){alert('单个红包金额须为 ¥0.01–200.00');return;}const chatId=state.activeChatId;if(!chatId)return;const msg=addMessage(chatId,'me',note,{type:'redpacket',redpacket:{amount:amount.toFixed(2),note,status:'unclaimed',claimedBy:null,sentAt:Date.now()}});document.getElementById('sendRedPacketSheet').classList.add('hidden');setTimeout(async()=>{const t=(state.chats[chatId]||[]).find(m=>m.id===msg.id);if(!t||t.redpacket.status==='claimed')return;const g=isGroupChat(chatId)?getGroupById(chatId.slice(2)):null,claimer=g?.memberIds?.length?g.memberIds[secureRandomInt(g.memberIds.length)]:chatId,c=getContactById(claimer);if(!c)return;t.redpacket.status='claimed';t.redpacket.claimedBy=claimer;t.redpacket.claimedAt=Date.now();persist();renderMessages();addMessage(chatId,claimer,`${c.name}领取了你的红包`,{systemNote:true});await replyWithTarot(chatId,claimer,'(刚领取了我发的微信红包，自然回应，不要复述系统提示)',c.persona);},8000+secureRandomInt(52000));});
}
function renderRedPacketDetail(msg){
 const mine=msg.from==='me',sender=mine?{name:state.myName||'我',avatar:state.myAvatar}:getContactById(msg.from),av=document.getElementById('rpDetailAvatar');
 av.style.backgroundImage=sender?.avatar?`url('${sender.avatar}')`:'';av.textContent=sender?.avatar?'':(sender?.name||'对方').slice(0,1);document.getElementById('rpDetailSender').textContent=`${sender?.name||'对方'}的红包`;document.getElementById('rpDetailNote').textContent=msg.redpacket.note;
 const open=document.getElementById('rpDetailOpen'),result=document.getElementById('rpDetailResult'),waiting=document.getElementById('rpDetailWaiting');open.classList.add('hidden');result.classList.add('hidden');waiting.classList.add('hidden');
 if(msg.redpacket.status==='claimed'){result.classList.remove('hidden');document.getElementById('rpAmountShow').textContent=mine?'红包已领取':msg.redpacket.amount;document.getElementById('rpResultUnit').textContent=mine?'':'元';document.getElementById('rpResultHint').textContent=mine?`${getContactById(msg.redpacket.claimedBy)?.name||'对方'}已领取`:'已存入零钱';}
 else if(mine)waiting.classList.remove('hidden');else{open.classList.remove('hidden');open.onclick=()=>{if(msg.redpacket.status==='claimed')return;msg.redpacket.status='claimed';msg.redpacket.claimedBy='me';msg.redpacket.claimedAt=Date.now();const w=getWallet(),amt=Number(msg.redpacket.amount)||0;w.balance+=amt;w.transactions.push({title:`微信红包 · ${sender?.name||'对方'}`,amount:amt,ts:Date.now()});saveWallet(w);persist();renderMessages();renderRedPacketDetail(msg);};}
}
function openRedPacketDetail(msgId){const msg=(state.chats[state.activeChatId]||[]).find(m=>String(m.id)===String(msgId));if(!msg?.redpacket)return;renderRedPacketDetail(msg);document.getElementById('redPacketOpenSheet')?.classList.remove('hidden');}

/* ============ 塔罗弹层 & 字卡管理 ============ */
function bindSheetClose() { document.getElementById('sheetClose')?.addEventListener('click', () => document.getElementById('tarotSheet').classList.add('hidden')); }
function renderWordCardList(contactId) {
  const list = contactId ? WordCards.getContactList(contactId) : WordCards.getAll();
  const box = document.getElementById('wordCardList');
  if (!box) return;
  const query = (document.getElementById('wordCardSearch')?.value || '').trim();
  const filtered = query ? list.filter(t => t.includes(query)) : list;
  box.innerHTML = filtered.map(t => `<div class="wc-item"><span>${escapeHtml(t)}</span><a href="#" class="wc-del" data-t="${escapeHtml(t)}">×</a></div>`).join('')
    || `<div style="padding:24px 4px;text-align:center;color:#999;font-size:13.5px;">${query ? '没有匹配的字卡' : '还没有字卡'}</div>`;
}
let currentWordCardContactId = null;
function openWordCardSheet(contactId = null) {
  currentWordCardContactId = contactId;
  const title = document.getElementById('wordCardSheetTitle');
  if (title) title.textContent = contactId ? `字卡管理（${getContactById(contactId)?.name || ''} 专属）` : '字卡管理（全局）';
  const search = document.getElementById('wordCardSearch');
  if (search) search.value = '';
  renderWordCardList(contactId);
  document.getElementById('wordCardSheet')?.classList.remove('hidden');
}
function bindWordCardSheet() {
  document.getElementById('rowWordCards')?.addEventListener('click', () => openWordCardSheet(null));
  document.getElementById('wordCardClose')?.addEventListener('click', () => document.getElementById('wordCardSheet').classList.add('hidden'));
  document.getElementById('wordCardSearch')?.addEventListener('input', () => renderWordCardList(currentWordCardContactId));
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
    body.innerHTML = `<div class="settings-card"><div class="settings-card-title">群成员</div>` + g.memberIds.map(id => {
      const c = getContactById(id); if (!c) return '';
      return `<div class="chat-item" style="border-radius:6px;">${avatarHtml(c.avatar, c.name, 40)}<div class="info"><div class="name">${escapeHtml(c.name)}</div></div></div>`;
    }).join('') + `</div><div class="sheet-btn cancel" id="deleteGroupBtn">解散群聊</div>`;
  } else {
    chatSettingsTarget = { type: 'contact', id: chatId };
    const c = getContactById(chatId);
    if (!c) return;
    document.getElementById('chatSettingsTitle').textContent = '角色设置';
    body.innerHTML = `
      <div class="settings-card">
        <div class="settings-card-title">头像</div>
        <div class="direct-avatar-preview">${avatarHtml(c.avatar, c.name, 56)}<div class="menu-row no-border" id="directSetAvatarBtn" style="flex:1;text-align:left;padding-left:4px;">点击选择照片直接设为头像</div></div>
        <input type="file" id="directAvatarFileInput" accept="image/*" class="hidden">
        ${state.avatarLibrary.length ? `<div class="settings-card-subtitle">或从头像库选择</div>
        <div class="avatar-grid" id="assignAvatarGrid" style="padding:0;">
          ${state.avatarLibrary.map(a => `<div class="avatar-lib-item" data-avatar-id="${a.id}"><img src="${a.dataUrl}"></div>`).join('')}
        </div>` : ''}
      </div>
      <div class="settings-card">
        <div class="settings-card-title">视频通话形象（图片或视频，可选）</div>
        <div id="callMediaPreview" style="margin-bottom:10px;">${c.callMedia ? (c.callMediaType==='video' ? `<video src="${c.callMedia}" style="width:100px;height:130px;object-fit:cover;border-radius:8px;" muted loop autoplay playsinline></video>` : `<img src="${c.callMedia}" style="width:100px;height:130px;object-fit:cover;border-radius:8px;">`) : '<div style="color:#999;font-size:13px;">未设置，通话时将显示头像</div>'}</div>
        <input type="file" id="callMediaFileInput" accept="image/*,video/*" class="hidden">
        <div class="menu-row" id="uploadCallMediaBtn">上传通话形象</div>
        ${c.callMedia ? '<div class="menu-row" id="removeCallMediaBtn" style="color:#fa5151;">移除通话形象</div>' : ''}
      </div>
      <div class="settings-card">
        <div class="settings-card-title">角色设定</div>
        <textarea id="editPersona" rows="3">${escapeHtml(c.persona || '')}</textarea>
      </div>
      <div class="settings-card">
        <div class="settings-card-title">字卡来源</div>
        <div class="form-row"><label>叠加专属字卡（在全局字卡基础上）</label><label class="switch"><input type="checkbox" id="editWordCardMode" ${c.wordCardMode === 'custom' ? 'checked' : ''}><span class="slider"></span></label></div>
        <div class="menu-row" id="editContactCustomCards" style="margin-top:2px;">编辑专属字卡</div>
      </div>
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

/* ============ 小程式：沐茶 MUTEA 点单 ============ */
const TEA_MENU=[
{id:'grape',category:'人气推荐',name:'多肉葡萄',desc:'巨峰葡萄果肉 · 清爽绿妍茶底',price:29,sold:823,img:'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=320&q=80'},
{id:'brown',category:'人气推荐',name:'黑糖波波牛乳',desc:'黑糖珍珠 · 鲜牛乳 · 不含茶',price:24,sold:615,img:'https://images.unsplash.com/photo-1558857563-b371033873b8?auto=format&fit=crop&w=320&q=80'},
{id:'mango',category:'人气推荐',name:'芒芒甘露',desc:'台农芒果 · 西柚 · 椰乳',price:28,sold:766,img:'https://images.unsplash.com/photo-1499638673689-79a0b5115d87?auto=format&fit=crop&w=320&q=80'},
{id:'jasmine',category:'轻乳茶',name:'茉莉轻乳茶',desc:'茉莉绿茶 · 云顶轻乳',price:19,sold:492,img:'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=320&q=80'},
{id:'oolong',category:'轻乳茶',name:'桂花乌龙轻乳茶',desc:'桂花乌龙 · 鲜奶 · 微咸奶盖',price:22,sold:381,img:'https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=320&q=80'},
{id:'matcha',category:'轻乳茶',name:'抹茶云顶',desc:'宇治抹茶 · 鲜乳 · 云顶奶盖',price:26,sold:288,img:'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?auto=format&fit=crop&w=320&q=80'},
{id:'lemon',category:'鲜果茶',name:'手打柠檬茶',desc:'香水柠檬 · 原叶红茶',price:18,sold:704,img:'https://images.unsplash.com/photo-1497534446932-c925b458314e?auto=format&fit=crop&w=320&q=80'},
{id:'peach',category:'鲜果茶',name:'白桃茉莉',desc:'白桃果肉 · 茉莉绿茶',price:21,sold:336,img:'https://images.unsplash.com/photo-1499638673689-79a0b5115d87?auto=format&fit=crop&w=320&q=80'},
{id:'orange',category:'鲜果茶',name:'满杯鲜橙',desc:'鲜橙果肉 · 绿茶 · 橙汁',price:23,sold:459,img:'https://images.unsplash.com/photo-1600271886742-f049cd451bba?auto=format&fit=crop&w=320&q=80'},
{id:'jasminepure',category:'原叶纯茶',name:'茉莉绿妍',desc:'清香茉莉 · 低温冷萃',price:13,sold:247,img:'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=320&q=80'},
{id:'oolongpure',category:'原叶纯茶',name:'金桂乌龙',desc:'金桂花香 · 炭焙乌龙',price:15,sold:193,img:'https://images.unsplash.com/photo-1594631252845-29fc4cc8cde9?auto=format&fit=crop&w=320&q=80'},
{id:'earl',category:'原叶纯茶',name:'伯爵红茶',desc:'佛手柑香 · 锡兰红茶',price:15,sold:174,img:'https://images.unsplash.com/photo-1597318181409-cf64d0b5d8a2?auto=format&fit=crop&w=320&q=80'}];
const TEA_TOPPINGS={none:{name:'不加料',price:0},pearl:{name:'黑糖珍珠',price:2},jelly:{name:'桂花冻',price:2},cream:{name:'云顶奶盖',price:3}};
const TEA_ACTIVE_ORDER_KEY='tarot_active_tea_order_v2';
let _teaDraft={contactId:null,cart:{},method:'delivery',address:'',note:''},_teaCustomProductId=null,_teaTrackTimers=[];

function bindMiniPrograms(){document.getElementById('rowMiniPrograms')?.addEventListener('click',()=>pushPage('page-miniprograms'));document.getElementById('backFromMiniPrograms')?.addEventListener('click',()=>popPage());document.getElementById('miniAppTea')?.addEventListener('click',openTeaOrder);}
function teaCartItems(){return Object.values(_teaDraft.cart).flat();}
function teaCartCount(){return teaCartItems().length;}
function teaSubtotal(){return teaCartItems().reduce((sum,x)=>sum+(TEA_MENU.find(p=>p.id===x.productId)?.price||0)+(TEA_TOPPINGS[x.topping]?.price||0),0);}
function teaDeliveryFee(){return _teaDraft.method==='delivery'&&teaCartCount()&&teaSubtotal()<38?6:0;}
function teaTotal(){return teaSubtotal()+teaDeliveryFee();}
function renderTeaContacts(){const box=document.getElementById('teaContactList');if(!box)return;box.innerHTML=state.contacts.map(c=>`<button class="tea-contact-item ${String(_teaDraft.contactId)===String(c.id)?'selected':''}" data-cid="${c.id}">${avatarHtml(c.avatar,c.name,34)}<span>${escapeHtml(c.name)}</span><small>收货人</small></button>`).join('')||'<div class="tea-empty">请先添加联系人</div>';}
function renderTeaMenu(category='人气推荐'){document.querySelectorAll('[data-tea-category]').forEach(x=>x.classList.toggle('selected',x.dataset.teaCategory===category));document.getElementById('teaMenuList').innerHTML=TEA_MENU.filter(p=>p.category===category).map(p=>{const qty=(_teaDraft.cart[p.id]||[]).length;return `<article class="tea-product"><img src="${p.img}" alt="${escapeHtml(p.name)}" loading="lazy"><div class="tea-product-info"><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.desc)}</p><small>月售 ${p.sold}+</small><div class="tea-product-bottom"><strong>¥${p.price} 起</strong><div class="tea-qty">${qty?`<button data-tea-minus="${p.id}">−</button><span>${qty}</span>`:''}<button class="plus" data-tea-plus="${p.id}">＋</button></div></div></div></article>`;}).join('');}
function updateTeaTotal(){const total=teaTotal(),count=teaCartCount();document.getElementById('teaTotalAmount').textContent=`¥${total.toFixed(2)}`;document.getElementById('teaCartCount').textContent=String(count);document.getElementById('teaCartCount').classList.toggle('hidden',!count);document.getElementById('teaGoPayBtn').disabled=!count;document.getElementById('teaFeeHint').textContent=_teaDraft.method==='pickup'?'免配送费':teaDeliveryFee()?'配送费 ¥6 · 满 ¥38 免配送':'已免配送费';return total;}
function selectCustomOption(button,attr){document.querySelectorAll(`[${attr}]`).forEach(x=>x.classList.toggle('selected',x===button));}
function openTeaCustomize(id){_teaCustomProductId=id;const p=TEA_MENU.find(x=>x.id===id);if(!p)return;document.getElementById('teaCustomizeName').textContent=p.name;selectCustomOption(document.querySelector('[data-custom-sugar="少糖"]'),'data-custom-sugar');selectCustomOption(document.querySelector('[data-custom-ice="少冰"]'),'data-custom-ice');selectCustomOption(document.querySelector('[data-custom-topping="none"]'),'data-custom-topping');document.getElementById('teaCustomizeSheet').classList.remove('hidden');}
function addCustomizedTea(){const sugar=document.querySelector('[data-custom-sugar].selected')?.dataset.customSugar||'少糖',ice=document.querySelector('[data-custom-ice].selected')?.dataset.customIce||'少冰',topping=document.querySelector('[data-custom-topping].selected')?.dataset.customTopping||'none';(_teaDraft.cart[_teaCustomProductId]||=[]).push({productId:_teaCustomProductId,sugar,ice,topping});document.getElementById('teaCustomizeSheet').classList.add('hidden');const cat=document.querySelector('[data-tea-category].selected')?.dataset.teaCategory||'人气推荐';renderTeaMenu(cat);updateTeaTotal();}
function removeTea(id){const list=_teaDraft.cart[id]||[];list.pop();if(!list.length)delete _teaDraft.cart[id];const cat=document.querySelector('[data-tea-category].selected')?.dataset.teaCategory||'人气推荐';renderTeaMenu(cat);updateTeaTotal();}
function showNewTeaOrder(){_teaDraft={contactId:state.contacts[0]?.id||null,cart:{},method:'delivery',address:safeGetItem(TEA_ADDRESS_KEY,'')||'',note:''};document.getElementById('teaOrderForm').classList.remove('hidden');document.getElementById('teaOrderTracking').classList.add('hidden');document.getElementById('teaBottomBar').classList.remove('hidden');document.getElementById('teaAddressInput').value=_teaDraft.address;document.getElementById('teaNoteInput').value='';document.querySelectorAll('.tea-method-chip').forEach(x=>x.classList.toggle('selected',x.dataset.method==='delivery'));document.getElementById('teaAddressWrap').classList.remove('hidden');document.getElementById('teaCategoryList').innerHTML=['人气推荐','轻乳茶','鲜果茶','原叶纯茶'].map((x,i)=>`<button data-tea-category="${x}" class="${i===0?'selected':''}">${x}</button>`).join('');renderTeaContacts();renderTeaMenu();updateTeaTotal();}
function openTeaOrder(){pushPage('page-teaorder');const active=safeLoadJSON(TEA_ACTIVE_ORDER_KEY,null);if(active&&!active.cleared)return renderTeaTracking(active);showNewTeaOrder();}
function bindTeaOrder(){
 document.getElementById('backFromTeaOrder')?.addEventListener('click',()=>popPage());
 document.getElementById('teaCategoryList')?.addEventListener('click',e=>{const b=e.target.closest('[data-tea-category]');if(b)renderTeaMenu(b.dataset.teaCategory);});
 document.getElementById('teaMenuList')?.addEventListener('click',e=>{const p=e.target.closest('[data-tea-plus]'),m=e.target.closest('[data-tea-minus]');if(p)openTeaCustomize(p.dataset.teaPlus);if(m)removeTea(m.dataset.teaMinus);});
 document.getElementById('teaCustomizeOptions')?.addEventListener('click',e=>{const b=e.target.closest('[data-custom-sugar],[data-custom-ice],[data-custom-topping]');if(!b)return;if(b.dataset.customSugar!=null)selectCustomOption(b,'data-custom-sugar');else if(b.dataset.customIce!=null)selectCustomOption(b,'data-custom-ice');else selectCustomOption(b,'data-custom-topping');});
 document.getElementById('teaCustomizeCancel')?.addEventListener('click',()=>document.getElementById('teaCustomizeSheet').classList.add('hidden'));document.getElementById('teaCustomizeConfirm')?.addEventListener('click',addCustomizedTea);
 document.getElementById('teaContactList')?.addEventListener('click',e=>{const x=e.target.closest('[data-cid]');if(x){_teaDraft.contactId=x.dataset.cid;renderTeaContacts();}});
 document.getElementById('teaMethodRow')?.addEventListener('click',e=>{const x=e.target.closest('[data-method]');if(!x)return;_teaDraft.method=x.dataset.method;document.querySelectorAll('.tea-method-chip').forEach(c=>c.classList.toggle('selected',c===x));document.getElementById('teaAddressWrap').classList.toggle('hidden',_teaDraft.method!=='delivery');updateTeaTotal();});
 document.getElementById('teaGoPayBtn')?.addEventListener('click',()=>{if(!teaCartCount()){alert('请先选择饮品');return;}if(!_teaDraft.contactId){alert('请选择收货人');return;}if(_teaDraft.method==='delivery'){_teaDraft.address=document.getElementById('teaAddressInput').value.trim();if(!_teaDraft.address){alert('请填写配送地址');return;}safeSetItem(TEA_ADDRESS_KEY,_teaDraft.address);}_teaDraft.note=document.getElementById('teaNoteInput').value.trim();document.getElementById('teaPayAmount').textContent=`¥${teaTotal().toFixed(2)}`;document.getElementById('teaPayCurrentBalance').textContent=`¥${getWallet().balance.toFixed(2)}`;document.getElementById('teaPaySummary').textContent=`${teaCartCount()} 杯 · ${_teaDraft.method==='delivery'?'配送':'到店自取'}`;pushPage('page-teapay');});
 document.getElementById('backFromTeaPay')?.addEventListener('click',()=>popPage());
 document.getElementById('teaConfirmPayBtn')?.addEventListener('click',()=>{if(_walletActionBusy)return;const total=teaTotal(),w=getWallet();if(w.balance<total){alert('余额不足，请先充值');return;}_walletActionBusy=true;runFaceIdSimulation(()=>{const w2=getWallet();if(w2.balance<total){_walletActionBusy=false;alert('余额不足');popPage();return;}const now=Date.now(),accept=25000+secureRandomInt(65000),prepare=(6+secureRandomInt(9))*60000,travel=_teaDraft.method==='delivery'?(12+secureRandomInt(17))*60000:(2+secureRandomInt(5))*60000;const order={id:now,contactId:_teaDraft.contactId,items:teaCartItems(),method:_teaDraft.method,address:_teaDraft.address,note:_teaDraft.note,total,createdAt:now,acceptedAt:now+accept,preparedAt:now+accept+prepare,completedAt:now+accept+prepare+travel,notified:false};w2.balance-=total;w2.transactions.push({title:`沐茶订单 · ${order.items.length}杯`,amount:-total,ts:now});saveWallet(w2);safeSaveJSON(TEA_ACTIVE_ORDER_KEY,order);_walletActionBusy=false;popPage();renderTeaTracking(order);});});
 document.getElementById('teaOrderAgainBtn')?.addEventListener('click',()=>{safeSaveJSON(TEA_ACTIVE_ORDER_KEY,{cleared:true});showNewTeaOrder();});
}
function teaItemDescription(item){const p=TEA_MENU.find(x=>x.id===item.productId),t=TEA_TOPPINGS[item.topping];return (p?.name||'饮品')+' · '+item.sugar+' · '+item.ice+(t&&t.price?' · '+t.name:'');}
function renderTeaTracking(order){
 document.getElementById('teaOrderForm').classList.add('hidden');document.getElementById('teaBottomBar').classList.add('hidden');document.getElementById('teaOrderTracking').classList.remove('hidden');
 const now=Date.now(),stage=now<order.acceptedAt?0:now<order.preparedAt?1:now<order.completedAt?2:3,steps=['订单已提交','商家制作中',order.method==='delivery'?'骑手配送中':'等待取餐','已送达'];
 document.getElementById('teaOrderSummary').innerHTML=`<strong>沐茶 MUTEA</strong>${order.items.map(x=>`<span>${escapeHtml(teaItemDescription(x))}</span>`).join('')}<small>实付 ¥${Number(order.total).toFixed(2)} · ${order.method==='delivery'?'配送':'自取'}</small>`;
 document.getElementById('teaTrackSteps').innerHTML=steps.map((s,i)=>`<div class="tea-track-step ${i<stage?'done':''} ${i===stage?'active':''}"><div class="tea-track-dot"></div><div class="tea-track-label">${s}<small>${i===stage&&stage<3?(stage===0?'等待商家确认':stage===1?'预计 '+Math.max(1,Math.ceil((order.preparedAt-now)/60000))+' 分钟完成':'预计 '+Math.max(1,Math.ceil((order.completedAt-now)/60000))+' 分钟送达'):''}</small></div></div>`).join('');
 _teaTrackTimers.forEach(clearTimeout);_teaTrackTimers=[];
 if(stage<3){const next=[order.acceptedAt,order.preparedAt,order.completedAt][stage];_teaTrackTimers.push(setTimeout(()=>renderTeaTracking(order),Math.max(1000,next-now+300)));}
 else if(!order.notified){order.notified=true;safeSaveJSON(TEA_ACTIVE_ORDER_KEY,order);const c=getContactById(order.contactId);if(c)replyWithTarot(String(c.id),String(c.id),`(我送的奶茶刚刚实际送达，你现在才收到。饮品是：${order.items.map(teaItemDescription).join('；')}。请自然回应)`,c.persona);}
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
  document.getElementById('cfgVoiceProvider').value = cfg.voiceProvider || 'openai';
  document.getElementById('cfgVoiceEndpoint').value = cfg.voiceEndpoint;
  document.getElementById('cfgVoiceGroupId').value = cfg.voiceGroupId || '';
  document.getElementById('cfgVoiceApiKey').value = cfg.voiceApiKey;
  document.getElementById('cfgVoiceModel').value = cfg.voiceModel;
  document.getElementById('cfgVoiceName').value = cfg.voiceName;
  updateVoiceProviderFields();
  document.getElementById('cfgAutoMsg').checked = cfg.autoMsg;
  document.getElementById('cfgAutoMoment').checked = cfg.autoMoment;
  document.getElementById('cfgAutoAvatar').checked = cfg.autoAvatar;
  document.getElementById('cfgAutoRedpacket').checked = cfg.autoRedpacket;
  loadCloudSettingsForm();
}
function updateVoiceProviderFields() {
  const provider = document.getElementById('cfgVoiceProvider')?.value;
  const isMiniMax = provider === 'minimax';
  document.getElementById('cfgVoiceGroupIdRow')?.classList.toggle('hidden', !isMiniMax);
  const nameLabel = document.getElementById('cfgVoiceNameLabel');
  if (nameLabel) nameLabel.textContent = isMiniMax ? '声音 Voice ID（克隆声音的ID）' : '音色';
  const nameInput = document.getElementById('cfgVoiceName');
  if (nameInput) nameInput.placeholder = isMiniMax ? '在 MiniMax 克隆好声音后拿到的 voice_id' : 'alloy / echo / nova...';
  const endpointInput = document.getElementById('cfgVoiceEndpoint');
  if (endpointInput) endpointInput.placeholder = isMiniMax ? 'https://api.minimax.chat/v1/t2a_v2（留空则自动使用）' : 'https://api.openai.com/v1/audio/speech';
}
function bindSettingsSave() {
  document.getElementById('cfgVoiceProvider')?.addEventListener('change', updateVoiceProviderFields);
  document.getElementById('saveSettingsBtn')?.addEventListener('click', () => {
    saveAIConfig({
      textEnabled: document.getElementById('cfgTextEnabled').checked,
      endpoint: document.getElementById('cfgEndpoint').value.trim(),
      apiKey: document.getElementById('cfgApiKey').value.trim(),
      model: document.getElementById('cfgModel').value.trim(),
      voiceEnabled: document.getElementById('cfgVoiceEnabled').checked,
      voiceProvider: document.getElementById('cfgVoiceProvider').value,
      voiceEndpoint: document.getElementById('cfgVoiceEndpoint').value.trim(),
      voiceGroupId: document.getElementById('cfgVoiceGroupId').value.trim(),
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
  bindHoldToRecord(holdBtn);
}
function getSupportedAudioMimeType() {
  if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
  const candidates = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  return candidates.find(c => MediaRecorder.isTypeSupported(c)) || '';
}
function bindHoldToRecord(holdBtn) {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    holdBtn.addEventListener('pointerdown', () => alert('当前浏览器不支持录音，请切换回文字输入'));
    return;
  }
  let mediaRecorder = null, recordedChunks = [], mediaStream = null, recordStartTs = 0, recording = false, starting = false;
  function cleanupStream() { mediaStream?.getTracks().forEach(t => t.stop()); mediaStream = null; }
  async function startRecording() {
    if (recording || starting) return;
    starting = true;
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      alert('无法访问麦克风，请检查系统/浏览器的麦克风权限设置');
      holdBtn.classList.remove('active');
      starting = false;
      return;
    }
    recordedChunks = [];
    const mimeType = getSupportedAudioMimeType();
    try { mediaRecorder = mimeType ? new MediaRecorder(mediaStream, { mimeType }) : new MediaRecorder(mediaStream); }
    catch (e) { alert('录音初始化失败：' + (e?.message || '未知错误')); cleanupStream(); starting = false; return; }
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
    recordStartTs = Date.now();
    mediaRecorder.start();
    recording = true;
    starting = false;
  }
  function stopRecording() {
    return new Promise(resolve => {
      if (!recording || !mediaRecorder) { resolve(null); return; }
      recording = false;
      const durationSec = Math.round((Date.now() - recordStartTs) / 1000 * 10) / 10;
      mediaRecorder.onstop = () => {
        cleanupStream();
        if (durationSec < 1) { resolve(null); return; }
        const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
        if (!blob.size) { resolve(null); return; }
        const reader = new FileReader();
        reader.onload = () => resolve({ dataUrl: reader.result, durationSec: Math.max(1, Math.round(durationSec)) });
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      };
      try { mediaRecorder.stop(); } catch (e) { cleanupStream(); resolve(null); }
    });
  }
  holdBtn.addEventListener('pointerdown', () => { holdBtn.classList.add('active'); startRecording(); });
  const stopTalk = async () => {
    if (!holdBtn.classList.contains('active')) return;
    holdBtn.classList.remove('active');
    const result = await stopRecording();
    if (result) sendVoiceMessage(result.dataUrl, result.durationSec);
  };
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
  safeStep('bindMessageRecall', bindMessageRecall);
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
