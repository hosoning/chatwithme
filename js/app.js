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
  myName: 'tarot_my_name_v1', chatBg: 'tarot_chat_bg_v1', momentsCover: 'tarot_moments_cover_v1'
};

const state = {
  contacts: safeLoadJSON(STORE.contacts, []),
  groups: safeLoadJSON(STORE.groups, []),
  chats: safeLoadJSON(STORE.chats, {}),
  moments: safeLoadJSON(STORE.moments, []),
  avatarLibrary: safeLoadJSON(STORE.avatarLib, []),
  myAvatar: safeGetItem(STORE.myAvatar, null) || null,
  myName: safeGetItem(STORE.myName, '塔罗世界的我') || '塔罗世界的我',
  chatBg: safeGetItem(STORE.chatBg, null) || null,
  momentsCover: safeGetItem(STORE.momentsCover, null) || null,
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
  safeSetItem(STORE.myName, state.myName || '塔罗世界的我');
  safeSetItem(STORE.chatBg, state.chatBg || '');
  safeSetItem(STORE.momentsCover, state.momentsCover || '');

  clearTimeout(_cloudSyncTimer);
  _cloudSyncTimer = setTimeout(() => {
    const cfg = getCloudConfig();
    if (cfg.enabled) {
      cloudUpload({
        contacts: state.contacts, groups: state.groups, chats: state.chats, moments: state.moments,
        avatarLibrary: state.avatarLibrary, myAvatar: state.myAvatar, myName: state.myName,
        chatBg: state.chatBg, momentsCover: state.momentsCover,
        wordCards: WordCards.getAll()
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
function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function getContactById(id) { return state.contacts.find(c => String(c.id) === String(id)); }
function getGroupById(id) { return state.groups.find(g => String(g.id) === String(id)); }
function isGroupChat(chatId) { return typeof chatId === 'string' && chatId.startsWith('g_'); }
function avatarHtml(dataUrl, name, size = 40) {
  if (dataUrl) return `<div class="avatar img" style="width:${size}px;height:${size}px;background-image:url('${dataUrl}')"></div>`;
  return `<div class="avatar" style="width:${size}px;height:${size}px;background:${hashColor(name)}">${escapeHtml(name || '?').slice(0,1)}</div>`;
}

/* ============ 导航 ============ */
let navStack = ['page-chatlist'];

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => { p.classList.add('hidden'); p.style.transform=''; p.style.transition=''; p.style.zIndex=''; });
  document.getElementById(id)?.classList.remove('hidden');
}
function setActiveTab(tabName) { document.querySelectorAll('.tab-item').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName)); }

function switchTab(tabName, pageId) {
  navStack = [pageId];
  showPage(pageId);
  setActiveTab(tabName);
}

function pushPage(id) {
  const next = document.getElementById(id);
  if (!next) return;
  next.classList.remove('hidden');
  next.style.zIndex = 50;
  next.style.transition = 'none';
  next.style.transform = 'translateX(100%)';
  void next.offsetWidth;
  requestAnimationFrame(() => {
    next.style.transition = 'transform 0.3s cubic-bezier(.25,.46,.45,.94)';
    next.style.transform = 'translateX(0)';
  });
  navStack.push(id);
}

function popPage() {
  if (navStack.length <= 1) return;
  const topId = navStack.pop();
  const top = document.getElementById(topId);
  if (!top) return;
  top.style.transition = 'transform 0.28s cubic-bezier(.25,.46,.45,.94)';
  top.style.transform = 'translateX(100%)';
  setTimeout(() => {
    top.classList.add('hidden');
    top.style.transform = ''; top.style.transition = ''; top.style.zIndex = '';
  }, 280);
}

function bindSwipeBack() {
  const appEl = document.getElementById('app');
  if (!appEl) return;
  let startX = 0, startY = 0, dragging = false, topEl = null;
  appEl.addEventListener('touchstart', e => {
    if (navStack.length <= 1) return;
    const t = e.touches[0];
    if (t.clientX > 40) return;
    startX = t.clientX; startY = t.clientY; dragging = true;
    topEl = document.getElementById(navStack[navStack.length - 1]);
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
      const el = topEl;
      setTimeout(() => { el.classList.add('hidden'); el.style.transform=''; el.style.transition=''; el.style.zIndex=''; }, 250);
    } else {
      topEl.style.transform = 'translateX(0)';
    }
    topEl = null;
  });
}

const TAB_ITEMS = [
  {tab:'chat', label:'微信', page:'page-chatlist', icon:'<path d="M4 4h16v12H8l-4 4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>'},
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
  if (nameEl) nameEl.textContent = state.myName || '塔罗世界的我';
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
  document.getElementById('rowChatBgClear')?.addEventListener('click', () => {
    state.chatBg = null; persist(); applyChatBackground(); alert('已恢复默认背景');
  });
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
    avatarEl.style.backgroundSize = 'cover';
    avatarEl.style.backgroundPosition = 'center';
    if (!state.myAvatar) {
      avatarEl.textContent = (state.myName || '我').slice(0, 1);
      avatarEl.style.display = 'flex';
      avatarEl.style.alignItems = 'center';
      avatarEl.style.justifyContent = 'center';
      avatarEl.style.color = '#fff';
      avatarEl.style.fontSize = '22px';
      avatarEl.style.fontWeight = '600';
    } else {
      avatarEl.textContent = '';
    }
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
  document.getElementById('momentsMyAvatar')?.addEventListener('click', () => {
    popPage();
    setTimeout(() => switchTab('me', 'page-me'), 0);
  });
}

/* ============ 发现页占位功能 ============ */
function bindDiscoverPlaceholders() {
  document.getElementById('rowScan')?.addEventListener('click', () => alert('扫一扫功能暂未开放'));
  document.getElementById('rowChannels')?.addEventListener('click', () => alert('视频号功能暂未开放'));
}

/* ============ 聊天列表 / 通讯录 ============ */
function renderChatList() {
  const box = document.getElementById('chatListItems');
  if (!box) return;
  const items = [
    ...state.contacts.map(c => ({ id: String(c.id), name: c.name, avatar: c.avatar })),
    ...state.groups.map(g => ({ id: 'g_' + g.id, name: g.name, avatar: null }))
  ];
  if (!items.length) { box.innerHTML = `<div style="padding:40px 20px;text-align:center;color:#999;font-size:14px;">还没有角色，点右上角 + 添加一个吧</div>`; return; }
  box.innerHTML = items.map(it => {
    const msgs = state.chats[it.id] || [];
    const last = msgs[msgs.length - 1];
    return `<div class="chat-item" data-id="${it.id}">
      ${avatarHtml(it.avatar, it.name, 50)}
      <div class="info">
        <div class="row1"><span class="name">${escapeHtml(it.name)}</span><span class="time">${last ? new Date(last.ts).toLocaleTimeString().slice(0,5) : ''}</span></div>
        <div class="last-msg">${last ? (last.type==='redpacket' ? '[红包]' : escapeHtml(last.text)) : '开始一段对话...'}</div>
      </div></div>`;
  }).join('');
}

function renderContactList() {
  const box = document.getElementById('contactListItems');
  if (!box) return;
  if (!state.contacts.length) { box.innerHTML = `<div style="padding:40px 20px;text-align:center;color:#999;font-size:14px;">还没有角色</div>`; return; }
  box.innerHTML = state.contacts.map(c => `<div class="contact-item" data-id="${c.id}">${avatarHtml(c.avatar, c.name, 50)}<div class="info"><div class="name">${escapeHtml(c.name)}</div></div></div>`).join('');
}

function bindListDelegation(containerId) {
  const box = document.getElementById(containerId);
  if (!box) return;
  let pressTimer = null;
  box.addEventListener('click', e => { const item = e.target.closest('[data-id]'); if (item) openChat(item.dataset.id); });
  box.addEventListener('pointerdown', e => {
    const item = e.target.closest('[data-id]'); if (!item) return;
    pressTimer = setTimeout(() => {
      if (isGroupChat(item.dataset.id)) {
        const g = getGroupById(item.dataset.id.slice(2));
        if (g && confirm(`删除群聊「${g.name}」？`)) { state.groups = state.groups.filter(x => x.id !== g.id); delete state.chats[item.dataset.id]; persist(); renderChatList(); }
      } else {
        const c = getContactById(item.dataset.id);
        if (c && confirm(`删除角色「${c.name}」及其聊天记录？`)) { state.contacts = state.contacts.filter(x => x.id !== c.id); delete state.chats[item.dataset.id]; persist(); renderChatList(); renderContactList(); }
      }
    }, 550);
  });
  ['pointerup','pointerleave','pointercancel'].forEach(ev => box.addEventListener(ev, () => clearTimeout(pressTimer)));
}

/* ============ 聊天详情 ============ */
function openChat(chatId) {
  state.activeChatId = chatId;
  const name = isGroupChat(chatId) ? (getGroupById(chatId.slice(2))?.name || '群聊') : (getContactById(chatId)?.name || '角色');
  const nameEl = document.getElementById('chatPeerName');
  if (nameEl) nameEl.textContent = name;
  if (!state.chats[chatId]) state.chats[chatId] = [];
  renderMessages();
  applyChatBackground();
  pushPage('page-chat');
}

function renderMessages() {
  const box = document.getElementById('msgList');
  if (!box) return;
  const chatId = state.activeChatId;
  const msgs = state.chats[chatId] || [];
  const group = isGroupChat(chatId);

  box.innerHTML = msgs.map(m => {
    if (m.systemNote) return `<div class="msg-system">${escapeHtml(m.text)}</div>`;
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
    } else if (m.voiceUrl) {
      bubbleHtml = `<div class="bubble voice" data-play="${m.id}"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="#07c160"/></svg><span>${Math.max(1, Math.round((m.text || '').length / 4))}″</span></div>`;
    } else {
      bubbleHtml = `<div class="bubble">${escapeHtml(m.text)}</div>`;
    }

    const senderLabel = (group && !isMe) ? `<div class="sender-label">${escapeHtml(name)}</div>` : '';
    return `<div class="msg-col ${isMe ? 'me' : ''}">
      ${senderLabel}
      <div class="msg-row ${isMe ? 'me' : ''}" data-id="${m.id}">${avatarHtml(avatarDataUrl, name, 40)}${bubbleHtml}</div>
    </div>`;
  }).join('');
  box.scrollTop = box.scrollHeight;
}

function bindMsgListDelegation() {
  const box = document.getElementById('msgList');
  if (!box) return;
  let pressTimer = null;
  box.addEventListener('pointerdown', e => { const row = e.target.closest('.msg-row'); if (row) pressTimer = setTimeout(() => openTarotSheet(row.dataset.id), 480); });
  ['pointerup','pointerleave','pointercancel'].forEach(ev => box.addEventListener(ev, () => clearTimeout(pressTimer)));
  box.addEventListener('contextmenu', e => e.preventDefault());
  box.addEventListener('click', e => {
    const playEl = e.target.closest('[data-play]');
    if (playEl) {
      const msg = (state.chats[state.activeChatId] || []).find(m => String(m.id) === playEl.dataset.play);
      if (msg?.voiceUrl) new Audio(msg.voiceUrl).play().catch(()=>{});
      return;
    }
    const rpEl = e.target.closest('[data-redpacket]');
    if (rpEl) openRedPacketDetail(rpEl.dataset.redpacket);
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
  persist();
  if (chatId === state.activeChatId) renderMessages();
  renderChatList();
  return msg;
}

const AVATAR_CHANGE_KEYWORDS = ['换头像', '换个头像', '换张头像', '改头像'];

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

  state.pendingBatch[chatId] = state.pendingBatch[chatId] || [];
  state.pendingBatch[chatId].push(text.trim());
  clearTimeout(state.batchTimer[chatId]);
  state.batchTimer[chatId] = setTimeout(() => {
    if (isGroupChat(chatId)) processGroupBatch(chatId);
    else processSingleBatch(chatId);
  }, 900);
}

async function replyWithTarot(chatId, fromId, text, persona) {
  const cards = drawCards(3);
  const shieldCards = drawCards(3);
  const shield = calcShield(shieldCards);
  const pool = WordCards.getForContact(getContactById(fromId));

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

async function requestAvatarChange(contactId, chatId) {
  const contact = getContactById(contactId);
  if (!contact || !state.avatarLibrary.length) return;
  const cards = drawCards(3);
  const chosen = await pickAvatarFromCards(cards, state.avatarLibrary, contact.persona);
  if (!chosen) return;
  contact.avatar = chosen.dataUrl;
  persist();
  addMessage(chatId, contactId, `${contact.name} 更换了头像`, { systemNote: true, cards });
  renderChatList(); renderContactList();
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
  const pool = WordCards.getForContact(contact);
  const picks = await interpretAndReply('(发一条朋友圈)', cards, pool, contact.persona);
  state.moments.unshift({ id: Date.now(), contactId: contact.id, name: contact.name, avatar: contact.avatar, content: picks.join(' '), image: null, cards, ts: Date.now(), comments: [] });
  persist(); renderMoments();
}
async function aiAutoChangeAvatar() {
  const cfg = getAIConfig();
  if (!cfg.autoAvatar || !state.contacts.length || !state.avatarLibrary.length) return;
  const contact = state.contacts[secureRandomInt(state.contacts.length)];
  await requestAvatarChange(String(contact.id), String(contact.id));
}
async function aiReplyToMoment(momentId, userComment) {
  const moment = state.moments.find(m => m.id === momentId);
  if (!moment) return;
  const contact = getContactById(moment.contactId);
  const cards = drawCards(3);
  const pool = WordCards.getForContact(contact);
  const picks = await interpretAndReply(userComment, cards, pool, contact?.persona);
  moment.comments = moment.comments || [];
  moment.comments.push({ from: 'me', text: userComment });
  moment.comments.push({ from: moment.name, text: picks.join(' '), cards });
  persist(); renderMoments();
}
setInterval(() => { try { if (secureRandomInt(100) < 3) aiAutoSendMessage(); } catch(e){ console.error(e); } }, 60000);
setInterval(() => { try { if (secureRandomInt(100) < 2) aiAutoPostMoment(); } catch(e){ console.error(e); } }, 120000);
setInterval(() => { try { if (secureRandomInt(100) < 2) aiAutoChangeAvatar(); } catch(e){ console.error(e); } }, 150000);

/* ============ 朋友圈：展示 + 用户发朋友圈 + AI评论 ============ */
function renderMoments() {
  const box = document.getElementById('momentsList');
  if (!box) return;
  box.innerHTML = state.moments.map(m => `
    <div class="moment-item" data-id="${m.id}">
      ${avatarHtml(m.avatar, m.name, 44)}
      <div class="moment-body">
        <div class="mname">${escapeHtml(m.name)}</div>
        ${m.content ? `<div class="content">${escapeHtml(m.content)}</div>` : ''}
        ${m.image ? `<img src="${m.image}" style="width:100%;max-width:220px;border-radius:8px;margin-top:6px;display:block;">` : ''}
        <div class="time-row"><span class="time">${new Date(m.ts).toLocaleString()}</span><span class="comment-btn" data-toggle-comment="${m.id}">评论</span></div>
        ${(m.comments?.length) ? `<div class="comment-list">${m.comments.map(c => `<div class="comment-line"><b>${escapeHtml(c.from === 'me' ? (state.myName||'我') : c.from)}：</b>${escapeHtml(c.text)}</div>`).join('')}</div>` : ''}
        <div class="comment-input-row hidden" data-comment-row="${m.id}"><input placeholder="评论一下..." data-comment-input="${m.id}"><button data-comment-submit="${m.id}">发送</button></div>
      </div></div>`).join('') || `<div style="padding:40px;text-align:center;color:#999;">还没有朋友圈动态</div>`;
}
function bindMomentsDelegation() {
  const box = document.getElementById('momentsList');
  if (!box) return;
  box.addEventListener('click', e => {
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

let _postMomentImage = null;

function bindPostMoment() {
  document.getElementById('btnPostMoment')?.addEventListener('click', () => {
    document.getElementById('postMomentText').value = '';
    document.getElementById('postMomentImgPreview').innerHTML = '';
    _postMomentImage = null;
    document.getElementById('postMomentSheet').classList.remove('hidden');
  });
  document.getElementById('postMomentCancel')?.addEventListener('click', () => {
    document.getElementById('postMomentSheet').classList.add('hidden');
  });
  document.getElementById('postMomentAddImgBtn')?.addEventListener('click', () => {
    document.getElementById('postMomentImgInput').click();
  });
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
    const moment = {
      id: Date.now(),
      contactId: 'me',
      name: state.myName || '我',
      avatar: state.myAvatar,
      content: text,
      image: _postMomentImage,
      ts: Date.now(),
      comments: []
    };
    state.moments.unshift(moment);
    persist();
    renderMoments();
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

async function aiCommentOnUserMoment(momentId, contactId) {
  const moment = state.moments.find(m => m.id === momentId);
  const contact = getContactById(contactId);
  if (!moment || !contact) return;
  const cards = drawCards(3);
  const pool = WordCards.getForContact(contact);
  const picks = await interpretAndReply(`(看到我发的朋友圈：${moment.content})`, cards, pool, contact.persona);
  moment.comments = moment.comments || [];
  moment.comments.push({ from: contact.name, text: picks.join(' '), cards });
  persist();
  renderMoments();
}

/* ============ 红包 ============ */
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
      if (isGroupChat(chatId)) {
        const g = getGroupById(chatId.slice(2));
        claimer = g?.memberIds?.[secureRandomInt(g.memberIds.length)];
      } else claimer = chatId;
      if (!claimer) return;
      const claimerName = getContactById(claimer)?.name || '对方';
      target.redpacket.status = 'claimed';
      target.redpacket.claimedBy = claimer;
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
      msg.redpacket.status = 'claimed'; msg.redpacket.claimedBy = 'me';
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
  document.getElementById('btnMore')?.addEventListener('click', () => openChatMoreMenu());
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

function openChatMoreMenu() {
  const choice = confirm('点击"确定"发红包，点击"取消"打开字卡管理');
  if (choice) openSendRedPacket();
  else openWordCardSheet(isGroupChat(state.activeChatId) ? null : state.activeChatId);
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
    const contact = { id: Date.now(), name, persona, avatar: null, wordCardMode: 'global', customWordCards: [] };
    state.contacts.push(contact); state.chats[String(contact.id)] = [];
    persist();
    document.getElementById('newContactName').value = ''; document.getElementById('newContactPersona').value = '';
    document.getElementById('addContactSheet').classList.add('hidden');
    renderChatList(); renderContactList(); openChat(String(contact.id));
  });
}
function openAddGroupSheet() {
  const box = document.getElementById('groupMemberChecklist');
  box.innerHTML = state.contacts.map(c => `
    <div class="wc-item"><label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" value="${c.id}" class="group-member-check"> ${escapeHtml(c.name)}</label></div>`).join('') || '<div style="padding:10px;color:#999;">还没有角色，请先添加角色</div>';
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
      <div class="settings-group-title">头像（点击从头像库指定）</div>
      <div class="avatar-grid" id="assignAvatarGrid" style="padding:0;">
        ${state.avatarLibrary.map(a => `<div class="avatar-lib-item" data-avatar-id="${a.id}"><img src="${a.dataUrl}"></div>`).join('') || '<div style="grid-column:1/-1;color:#999;font-size:13px;">头像库为空，请到 我→头像库管理 上传</div>'}
      </div>
      <div class="settings-group-title">角色设定</div>
      <textarea id="editPersona" rows="3" style="width:100%;border:1px solid #ddd;border-radius:6px;padding:8px;">${escapeHtml(c.persona || '')}</textarea>
      <div class="settings-group-title">字卡来源</div>
      <div class="form-row"><label>使用专属字卡（而非全局）</label><label class="switch"><input type="checkbox" id="editWordCardMode" ${c.wordCardMode === 'custom' ? 'checked' : ''}><span class="slider"></span></label></div>
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
    const avatarItem = e.target.closest('[data-avatar-id]');
    if (avatarItem && chatSettingsTarget.type === 'contact') {
      const c = getContactById(chatSettingsTarget.id);
      const a = state.avatarLibrary.find(x => String(x.id) === avatarItem.dataset.avatarId);
      if (c && a) { c.avatar = a.dataUrl; persist(); renderMessages(); renderChatList(); renderContactList(); alert('头像已更新'); }
      return;
    }
    if (e.target.closest('#editContactCustomCards') && chatSettingsTarget.type === 'contact') {
      openWordCardSheet(String(chatSettingsTarget.id));
      return;
    }
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
}

/* ============ 头像库管理页 ============ */
function renderAvatarLibGrid() {
  const grid = document.getElementById('avatarLibGrid');
  if (!grid) return;
  grid.innerHTML = state.avatarLibrary.map(a => `
    <div class="avatar-lib-item" data-id="${a.id}">
      <img src="${a.dataUrl}">
      <div class="del-x" data-del="${a.id}">×</div>
      <input placeholder="标签(如:开心)" value="${escapeHtml(a.tag || '')}" data-tag="${a.id}">
    </div>`).join('') || '<div style="grid-column:1/-1;color:#999;text-align:center;padding:30px;">还没有头像，点右上角 + 添加</div>';
}
function bindAvatarLib() {
  document.getElementById('rowAvatarLib')?.addEventListener('click', () => { renderAvatarLibGrid(); pushPage('page-avatarlib'); });
  document.getElementById('backFromAvatarLib')?.addEventListener('click', () => popPage());
  document.getElementById('btnAddAvatarImg')?.addEventListener('click', () => document.getElementById('avatarLibFileInput').click());
  document.getElementById('avatarLibFileInput')?.addEventListener('change', e => {
    [...e.target.files].forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => { state.avatarLibrary.push({ id: Date.now() + Math.random(), dataUrl: ev.target.result, tag: '' }); persist(); renderAvatarLibGrid(); };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
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

/* ============ 自己头像上传 ============ */
function bindMyAvatarUpload() {
  document.getElementById('myAvatarFileInput')?.addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { state.myAvatar = ev.target.result; persist(); renderMePage(); renderMessages(); renderMomentsProfile(); };
    reader.readAsDataURL(file);
  });
}

/* ============ 导出 / 导入 ============ */
function exportData() {
  const data = {
    contacts: state.contacts, groups: state.groups, chats: state.chats, moments: state.moments,
    avatarLibrary: state.avatarLibrary, myAvatar: state.myAvatar, myName: state.myName,
    chatBg: state.chatBg, momentsCover: state.momentsCover,
    wordCards: WordCards.getAll(), aiConfig: getAIConfig(), exportedAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `塔罗对话备份_${Date.now()}.json`; a.click();
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
function saveCurrentCloudForm() {
  saveCloudConfig({
    enabled: document.getElementById('cfgCloudEnabled').checked,
    roomId: document.getElementById('cfgRoomId').value.trim()
  });
}
function bindCloudSync() {
  document.getElementById('cloudUploadBtn')?.addEventListener('click', async () => {
    saveCurrentCloudForm();
    const ok = await cloudUpload({
      contacts: state.contacts, groups: state.groups, chats: state.chats, moments: state.moments,
      avatarLibrary: state.avatarLibrary, myAvatar: state.myAvatar, myName: state.myName,
      chatBg: state.chatBg, momentsCover: state.momentsCover,
      wordCards: WordCards.getAll()
    });
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
function bindInputBar() {
  const msgInput = document.getElementById('msgInput');
  const holdBtn = document.getElementById('holdTalkBtn');
  const micBtn = document.getElementById('micBtn');
  const moreBtn = document.getElementById('btnMore');
  const sendBtn = document.getElementById('btnSend');
  if (!msgInput || !holdBtn || !micBtn || !moreBtn || !sendBtn) return;

  function toggleSendBtn() {
    const hasText = msgInput.value.trim().length > 0;
    sendBtn.classList.toggle('hidden', !hasText);
    moreBtn.classList.toggle('hidden', hasText);
  }
  function doSend() {
    if (!msgInput.value.trim()) return;
    handleSend(msgInput.value);
    msgInput.value = '';
    toggleSendBtn();
  }

  msgInput.addEventListener('input', toggleSendBtn);
  msgInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSend(); });
  sendBtn.addEventListener('click', doSend);

  micBtn.addEventListener('click', () => {
    const enteringVoiceMode = !msgInput.classList.contains('hidden');
    msgInput.classList.toggle('hidden', enteringVoiceMode);
    holdBtn.classList.toggle('hidden', !enteringVoiceMode);
    if (enteringVoiceMode) { moreBtn.classList.add('hidden'); sendBtn.classList.add('hidden'); }
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

async function init() {
  await safeStepAsync('tryCloudLoadOnStartup', tryCloudLoadOnStartup);
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
  safeStep('bindDiscoverPlaceholders', bindDiscoverPlaceholders);
  safeStep('bindSheetClose', bindSheetClose);
  safeStep('bindWordCardSheet', bindWordCardSheet);
  safeStep('bindAddMenu', bindAddMenu);
  safeStep('bindAddContact', bindAddContact);
  safeStep('bindAddGroup', bindAddGroup);
  safeStep('bindNavButtons', bindNavButtons);
  safeStep('bindSettingsSave', bindSettingsSave);
  safeStep('bindInputBar', bindInputBar);
  safeStep('bindRedPacket', bindRedPacket);
  safeStep('bindAvatarLib', bindAvatarLib);
  safeStep('bindMyAvatarUpload', bindMyAvatarUpload);
  safeStep('bindExportImport', bindExportImport);
  safeStep('bindEditName', bindEditName);
  safeStep('bindChatBackground', bindChatBackground);
  safeStep('bindChatSettingsDelegation', bindChatSettingsDelegation);
  safeStep('bindSwipeBack', bindSwipeBack);
  safeStep('bindCloudSync', bindCloudSync);
  safeStep('bindPostMoment', bindPostMoment);
  safeStep('showPage', () => showPage('page-chatlist'));
}

document.addEventListener('DOMContentLoaded', init);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW注册失败', e));
  });
}