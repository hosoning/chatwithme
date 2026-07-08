// ============ 初始数据 ============
const state = {
  peerName: "未知旅人",
  messages: [],     // {id, from:'me'|'peer', text, cards, shield, ts}
  moments: [],
  pendingUserBatch: [], // 短时间内用户连续发来的消息缓冲
  batchTimer: null
};

let longPressTimer = null;

// ============ 页面切换 ============
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

document.querySelectorAll('.tab-item').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    if (tab.dataset.tab === 'discover') showPage('page-moments');
    else showPage('page-chatlist');
  });
});

// ============ 渲染聊天列表 ============
function renderChatList() {
  const box = document.getElementById('chatListItems');
  box.innerHTML = `
    <div class="chat-item" id="openChatBtn">
      <div class="avatar"></div>
      <div class="info">
        <div class="row1"><span class="name">${state.peerName}</span><span class="time">刚刚</span></div>
        <div class="last-msg">${state.messages.at(-1)?.text ?? '开始一段对话...'}</div>
      </div>
    </div>`;
  document.getElementById('openChatBtn').addEventListener('click', () => showPage('page-chat'));
}

// ============ 渲染消息列表 ============
function renderMessages() {
  const box = document.getElementById('msgList');
  box.innerHTML = state.messages.map(m => `
    <div class="msg-row ${m.from === 'me' ? 'me' : ''}" data-id="${m.id}">
      <div class="avatar"></div>
      <div class="bubble">${escapeHtml(m.text)}</div>
    </div>`).join('');
  box.scrollTop = box.scrollHeight;

  // 绑定长按事件
  box.querySelectorAll('.msg-row').forEach(row => {
    row.addEventListener('touchstart', () => startLongPress(row.dataset.id));
    row.addEventListener('touchend', cancelLongPress);
    row.addEventListener('touchmove', cancelLongPress);
    row.addEventListener('mousedown', () => startLongPress(row.dataset.id));
    row.addEventListener('mouseup', cancelLongPress);
    row.addEventListener('mouseleave', cancelLongPress);
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ============ 长按查看牌面/保护罩 ============
function startLongPress(msgId) {
  longPressTimer = setTimeout(() => openTarotSheet(msgId), 480);
}
function cancelLongPress() {
  clearTimeout(longPressTimer);
}

function openTarotSheet(msgId) {
  const msg = state.messages.find(m => m.id == msgId);
  if (!msg) return;

  document.getElementById('tarotCardsView').innerHTML = (msg.cards || []).map(c => `
    <div class="tarot-card-mini ${c.reversed ? 'reversed' : ''}">
      <div class="card-face">${c.name}</div>
      <div>${c.reversed ? '逆位' : '正位'}</div>
    </div>`).join('');

  document.getElementById('shieldCardsView').innerHTML = (msg.shieldCards || []).map(c => `
    <div class="tarot-card-mini ${c.reversed ? 'reversed' : ''}">
      <div class="card-face">${c.name}</div>
      <div>${c.reversed ? '逆位' : '正位'}</div>
    </div>`).join('');

  const shield = msg.shield ?? 0;
  document.getElementById('shieldFill').style.width = shield + '%';
  document.getElementById('shieldNum').textContent = shield;

  document.getElementById('tarotSheet').classList.remove('hidden');
}
document.getElementById('sheetClose').addEventListener('click', () => {
  document.getElementById('tarotSheet').classList.add('hidden');
});

// ============ 字卡管理弹层 ============
function renderWordCardList() {
  const list = WordCards.getAll();
  document.getElementById('wordCardList').innerHTML = list.map(t => `
    <div class="wc-item"><span>${escapeHtml(t)}</span><a href="#" data-t="${escapeHtml(t)}" class="wc-del">删除</a></div>
  `).join('');
  document.querySelectorAll('.wc-del').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      WordCards.remove(el.dataset.t);
      renderWordCardList();
    });
  });
}
document.getElementById('btnMore').addEventListener('click', () => {
  renderWordCardList();
  document.getElementById('wordCardSheet').classList.remove('hidden');
});
document.getElementById('wordCardClose').addEventListener('click', () => {
  document.getElementById('wordCardSheet').classList.add('hidden');
});
document.getElementById('addWordCardBtn').addEventListener('click', () => {
  const input = document.getElementById('newWordCard');
  if (input.value.trim()) {
    WordCards.add(input.value.trim());
    input.value = '';
    renderWordCardList();
  }
});

// ============ 核心流程 1：用户发消息 -> AI理解 -> 抽牌 -> 回复 ============
function addMessage(from, text, extra = {}) {
  const msg = { id: Date.now() + Math.random(), from, text, ts: Date.now(), ...extra };
  state.messages.push(msg);
  renderMessages();
  renderChatList();
  return msg;
}

document.getElementById('msgInput').addEventListener('keydown', async e => {
  if (e.key === 'Enter') {
    const val = e.target.value.trim();
    if (!val) return;
    e.target.value = '';
    addMessage('me', val);

    // 收集短时间内连续发送的多条消息，做批处理判断
    state.pendingUserBatch.push(val);
    clearTimeout(state.batchTimer);
    state.batchTimer = setTimeout(() => processUserBatch(), 900);
  }
});

async function processUserBatch() {
  const batch = [...state.pendingUserBatch];
  state.pendingUserBatch = [];
  if (batch.length === 0) return;

  // 第2步：AI判断这些消息是"同一件事"还是"不同的事"，决定抽几组牌
  const groups = await groupMessages(batch);

  for (const group of groups) {
    const combinedText = group.join('；');

    // 第3步：真随机抽3张塔罗牌
    const cards = drawCards(3);

    // 额外抽3张算保护罩
    const shieldCards = drawCards(3);
    const shield = calcShield(shieldCards);

    // 第4-5步：AI结合牌意 + 字卡库，挑选回复内容
    const pool = WordCards.getAll();
    const picks = await interpretAndReply(combinedText, cards, pool);

    // 可能回复多条消息
    picks.forEach((text, i) => {
      setTimeout(() => {
        addMessage('peer', text, {
          cards,
          shieldCards,
          shield
        });
      }, (i + 1) * 500);
    });
  }
}

// ============ 核心流程 2：AI自主决定发消息 ============
async function aiAutoSendMessage() {
  const cards = drawCards(3);
  const shieldCards = drawCards(3);
  const shield = calcShield(shieldCards);
  const pool = WordCards.getAll();
  const picks = await interpretAndReply("(主动发起对话)", cards, pool);
  picks.forEach((text, i) => {
    setTimeout(() => addMessage('peer', text, { cards, shieldCards, shield }), i * 500);
  });
}

// 举例：每隔一段随机时间，有一定概率触发主动发消息（可自行调整策略/开关）
setInterval(() => {
  if (secureRandomInt(100) < 3) { // 概率示例
    aiAutoSendMessage();
  }
}, 60 * 1000);

// ============ 核心流程 3：AI自主决定发朋友圈 ============
async function aiAutoPostMoment() {
  const cards = drawCards(3);
  const pool = WordCards.getAll();
  const picks = await interpretAndReply("(发一条朋友圈)", cards, pool);
  const content = picks.join(' ');
  state.moments.unshift({
    id: Date.now(),
    name: state.peerName,
    content,
    cards,
    ts: Date.now()
  });
  renderMoments();
}

// ============ 核心流程 4：AI自主决定回复用户朋友圈 ============
async function aiReplyToMoment(momentId, userComment) {
  const moment = state.moments.find(m => m.id === momentId);
  if (!moment) return;
  const cards = drawCards(3);
  const pool = WordCards.getAll();
  const picks = await interpretAndReply(userComment, cards, pool);
  moment.replies = moment.replies || [];
  moment.replies.push({ text: picks.join(' '), cards, from: state.peerName });
  renderMoments();
}

// ============ 渲染朋友圈 ============
function renderMoments() {
  const box = document.getElementById('momentsList');
  box.innerHTML = state.moments.map(m => `
    <div class="moment-item">
      <div class="avatar"></div>
      <div>
        <div class="name">${m.name}</div>
        <div class="content">${escapeHtml(m.content)}</div>
        <div class="time">${new Date(m.ts).toLocaleString()}</div>
      </div>
    </div>`).join('');
}

// ============ 初始化 ============
renderChatList();
renderMessages();
renderMoments();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}