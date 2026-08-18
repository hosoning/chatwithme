const AI_CFG_KEY = 'tarot_ai_config_v1';

function getAIConfig() {
  const def = {
    textEnabled: false, endpoint: 'https://api.openai.com/v1/chat/completions', apiKey: '', model: 'gpt-4o-mini',
    voiceEnabled: false, voiceEndpoint: 'https://api.openai.com/v1/audio/speech', voiceApiKey: '', voiceModel: 'tts-1', voiceName: 'alloy',
    autoMsg: false, autoMoment: false, autoAvatar: false, autoRedpacket: true
  };
  try {
    const raw = localStorage.getItem(AI_CFG_KEY);
    if (!raw) return def;
    const parsed = JSON.parse(raw);
    return { ...def, ...parsed };
  } catch (e) {
    console.error('AI配置读取失败，使用默认值', e);
    try { localStorage.removeItem(AI_CFG_KEY); } catch(_) {}
    return def;
  }
}
function saveAIConfig(cfg) {
  try { localStorage.setItem(AI_CFG_KEY, JSON.stringify(cfg)); }
  catch (e) { console.error('AI配置保存失败', e); }
}

async function callLLM(systemPrompt, userPrompt) {
  const cfg = getAIConfig();
  if (!cfg.textEnabled || !cfg.apiKey) return null;
  try {
    const res = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }] })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? null;
  } catch (e) { console.warn('LLM调用失败，使用本地兜底逻辑', e); return null; }
}

async function synthesizeVoice(text) {
  const cfg = getAIConfig();
  if (!cfg.voiceEnabled) return null;
  const key = cfg.voiceApiKey || cfg.apiKey;
  if (!key) return null;
  try {
    const res = await fetch(cfg.voiceEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model: cfg.voiceModel, voice: cfg.voiceName, input: text })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch (e) { console.warn('语音合成失败', e); return null; }
}

function localSimilarity(a, b) {
  const setA = new Set(a), setB = new Set(b);
  const inter = [...setA].filter(x => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : inter / union;
}

async function groupMessages(messages) {
  const llmResult = await callLLM(
    '你是语义分组助手。把用户连续发送的多条消息按是否属于同一件事分组，只输出JSON数组，例如[[0,1],[2]]，不要输出其他任何文字。',
    JSON.stringify(messages)
  );
  if (llmResult) {
    try {
      const idxGroups = JSON.parse(llmResult.match(/\[[\s\S]*\]/)?.[0] ?? llmResult);
      return idxGroups.map(g => g.map(i => messages[i]));
    } catch (e) {}
  }
  const groups = [];
  let current = [messages[0]];
  for (let i = 1; i < messages.length; i++) {
    const sim = localSimilarity(messages[i - 1], messages[i]);
    if (sim > 0.15) current.push(messages[i]);
    else { groups.push(current); current = [messages[i]]; }
  }
  groups.push(current);
  return groups;
}

async function interpretAndReply(userText, cards, wordCardPool, persona) {
  if (!wordCardPool || !wordCardPool.length) wordCardPool = WordCards._defaults();
  const cardDesc = cards.map(c => `${c.name}(${c.reversed ? '逆位' : '正位'}): ${c.meaning}`).join('; ');
  const sys = `你正在扮演角色："${persona || '一个通过塔罗牌理解世界的人'}"。
你只能使用给定字卡词库中的词句拼接回复，禁止编造新词。
可用字卡: ${JSON.stringify(wordCardPool)}
请结合用户消息和塔罗牌牌意，从字卡中挑选1~4个，按顺序输出JSON数组，不要输出其他任何文字。`;
  const llmResult = await callLLM(sys, `用户消息: ${userText}\n抽到的塔罗牌: ${cardDesc}`);
  if (llmResult) {
    try {
      const picked = JSON.parse(llmResult.match(/\[[\s\S]*\]/)?.[0] ?? llmResult);
      if (Array.isArray(picked) && picked.every(t => wordCardPool.includes(t)) && picked.length) return picked;
    } catch (e) {}
  }
  const positiveCount = cards.filter(c => !c.reversed).length;
  const pool = [...wordCardPool];
  const n = Math.min(pool.length, positiveCount >= 2 ? 1 : 2) || 1;
  const picked = [];
  for (let i = 0; i < n && pool.length; i++) {
    const idx = secureRandomInt(pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

function shouldSendRedPacket(cards) {
  const cfg = getAIConfig();
  if (!cfg.autoRedpacket) return false;
  if (!isLuckyDraw(cards)) return false;
  return secureRandomInt(100) < 40;
}
function randomRedPacketAmount() {
  const cents = secureRandomInt(19999) + 1;
  return (cents / 100).toFixed(2);
}

async function pickAvatarFromCards(cards, library, persona) {
  if (!library || !library.length) return null;
  const cardDesc = cards.map(c => `${c.name}(${c.reversed ? '逆位' : '正位'}):${c.meaning}`).join('; ');
  const libDesc = library.map((a, i) => `${i}:${a.tag || '无标签'}`).join('; ');
  const sys = `你正在扮演角色:"${persona || '一个用塔罗牌做选择的人'}"。请根据抽到的塔罗牌牌意，从头像库列表中选出一个最契合当下能量的编号，只输出数字，不要输出其他任何文字。头像库(编号:标签): ${libDesc}`;
  const result = await callLLM(sys, `抽到的塔罗牌: ${cardDesc}`);
  let idx = null;
  if (result) { const m = result.match(/\d+/); if (m) idx = parseInt(m[0]); }
  if (idx === null || idx < 0 || idx >= library.length) idx = secureRandomInt(library.length);
  return library[idx];
}

/* ===== Reply delay + options patch ===== */
(function installReplyOptionsPatch() {
  const GLOBAL_DELAY_KEY = 'tarot_reply_delay_ms_v1';
  let nextDelayMs = null;
  const pendingDelayByChat = Object.create(null);
  const replyContextByChat = Object.create(null);

  function sleep(ms) { return new Promise(r => setTimeout(r, Math.max(0, Number(ms) || 0))); }
  function getGlobalDelay() {
    const n = Number(localStorage.getItem(GLOBAL_DELAY_KEY));
    return Number.isFinite(n) && n >= 0 ? n : 1000;
  }
  function setGlobalDelay(ms) { localStorage.setItem(GLOBAL_DELAY_KEY, String(Math.max(0, Number(ms) || 0))); }
  function formatDelay(ms) {
    ms = Number(ms) || 0;
    if (ms === 0) return '立即';
    if (ms < 1000) return `${ms}ms`;
    return `${ms / 1000}秒`;
  }
  function getReplyDelay(chatId) {
    if (replyContextByChat[chatId] != null) return replyContextByChat[chatId];
    return getGlobalDelay();
  }

  window.addEventListener('load', () => setTimeout(() => {
    if (typeof window.handleSend !== 'function' || typeof window.replyWithTarot !== 'function') return;
    window.state = state;

    const originalHandleSend = window.handleSend;
    const originalProcessSingleBatch = window.processSingleBatch;
    const originalProcessGroupBatch = window.processGroupBatch;
    const originalRenderMessages = window.renderMessages;

    window.handleSend = function(text) {
      const chatId = window.state?.activeChatId;
      if (chatId && nextDelayMs != null) {
        pendingDelayByChat[chatId] = nextDelayMs;
        nextDelayMs = null;
        updateDelayButton();
      }
      return originalHandleSend(text);
    };

    window.processSingleBatch = async function(contactId) {
      replyContextByChat[contactId] = pendingDelayByChat[contactId] != null ? pendingDelayByChat[contactId] : getGlobalDelay();
      delete pendingDelayByChat[contactId];
      try { return await originalProcessSingleBatch(contactId); }
      finally { delete replyContextByChat[contactId]; }
    };

    window.processGroupBatch = async function(groupId) {
      replyContextByChat[groupId] = pendingDelayByChat[groupId] != null ? pendingDelayByChat[groupId] : getGlobalDelay();
      delete pendingDelayByChat[groupId];
      try { return await originalProcessGroupBatch(groupId); }
      finally { delete replyContextByChat[groupId]; }
    };

    window.replyWithTarot = async function(chatId, fromId, text, persona) {
      const cards = drawCards(3);
      const shieldCards = drawCards(3);
      const shield = calcShield(shieldCards);
      const contact = getContactById(fromId);
      const pool = WordCards.getForContact(contact);
      const delayMs = getReplyDelay(chatId);

      showTypingIndicator(chatId, contact);
      try {
        await sleep(delayMs);
        if (shouldSendRedPacket(cards)) {
          const amount = randomRedPacketAmount();
          const note = pool[secureRandomInt(pool.length)] || '恭喜发财';
          addMessage(chatId, fromId, note, { type:'redpacket', cards, shieldCards, shield, redpacket:{ amount, note, status:'unclaimed', claimedBy:null } });
          return;
        }
        const picks = await interpretAndReply(text, cards, pool, persona);
        const safePicks = Array.isArray(picks) && picks.length ? picks : [(pool && pool.length ? pool[secureRandomInt(pool.length)] : '嗯')];
        for (let i = 0; i < safePicks.length; i++) {
          if (i > 0) {
            showTypingIndicator(chatId, contact);
            await sleep(delayMs);
          }
          const voiceUrl = await synthesizeVoice(safePicks[i]);
          addMessage(chatId, fromId, safePicks[i], { cards, shieldCards, shield, voiceUrl });
        }
      } finally { hideTypingIndicator(); }
    };

    window.sendOptionsMessage = function(chatId, options) {
      const qInput = document.getElementById('optionsQuestionInput');
      const question = (qInput?.value || '').trim();
      addMessage(chatId, 'me', question || '[选项]', { type:'options', options, question });
      let responder = chatId;
      if (isGroupChat(chatId)) {
        const g = getGroupById(chatId.slice(2));
        if (!g?.memberIds?.length) return;
        responder = g.memberIds[secureRandomInt(g.memberIds.length)];
      }
      if (!responder) return;
      replyContextByChat[chatId] = nextDelayMs != null ? nextDelayMs : getGlobalDelay();
      nextDelayMs = null;
      updateDelayButton();
      window.replyToOptions(chatId, responder, options, getContactById(responder)?.persona, question)
        .finally(() => { delete replyContextByChat[chatId]; });
    };

    window.replyToOptions = async function(chatId, fromId, options, persona, question = '') {
      const contact = getContactById(fromId);
      showTypingIndicator(chatId, contact);
      try {
        await sleep(getReplyDelay(chatId));
        const idx = secureRandomInt(options.length + 1);
        if (idx === options.length) {
          hideTypingIndicator();
          await window.replyWithTarot(chatId, fromId, `${question ? `问题：${question}；` : ''}可选项：${options.join('、')}；选择其他并自然回应`, persona);
          return;
        }
        const cards = drawCards(3);
        const shieldCards = drawCards(3);
        const shield = calcShield(shieldCards);
        const answer = options[idx];
        const voiceUrl = await synthesizeVoice(answer);
        addMessage(chatId, fromId, answer, { cards, shieldCards, shield, voiceUrl, optionAnswerTo: question || null });
      } finally { hideTypingIndicator(); }
    };

    window.renderMessages = function() {
      const out = originalRenderMessages.apply(this, arguments);
      const chatId = window.state?.activeChatId;
      const msgs = window.state?.chats?.[chatId] || [];
      const optionMsgs = msgs.filter(m => m.type === 'options');
      const rows = document.querySelectorAll('#msgList .bubble.options');
      rows.forEach((bubble, i) => {
        const msg = optionMsgs[i];
        if (!msg) return;
        const title = bubble.querySelector('.options-title');
        if (title) title.textContent = msg.question || '请选择';
      });
      return out;
    };

    const optionsSheet = document.getElementById('sendOptionsSheet');
    const optionsList = document.getElementById('optionsInputList');
    if (optionsSheet && optionsList && !document.getElementById('optionsQuestionInput')) {
      const wrap = document.createElement('div');
      wrap.className = 'form-row col';
      wrap.style.marginBottom = '12px';
      wrap.innerHTML = '<label>问题</label><input id="optionsQuestionInput" maxlength="60" placeholder="例如：今晚想吃什么？">';
      optionsList.parentNode.insertBefore(wrap, optionsList);
    }

    const originalOpenSendOptions = window.openSendOptions;
    window.openSendOptions = function() {
      const r = originalOpenSendOptions.apply(this, arguments);
      const q = document.getElementById('optionsQuestionInput');
      if (q) q.value = '';
      return r;
    };

    injectGlobalDelaySetting();
    injectSingleMessageDelayControl();
    window.renderMessages();
  }, 0));

  function injectGlobalDelaySetting() {
    const saveBtn = document.getElementById('saveSettingsBtn');
    if (!saveBtn || document.getElementById('replyGlobalDelaySelect')) return;
    const title = document.createElement('div');
    title.className = 'settings-group-title';
    title.textContent = '回复速度';
    const row = document.createElement('div');
    row.className = 'form-row col';
    row.innerHTML = '<label>整体回复间隔</label><select id="replyGlobalDelaySelect">\
      <option value="0">立即</option><option value="500">0.5 秒</option><option value="1000">1 秒</option>\
      <option value="2000">2 秒</option><option value="3000">3 秒</option><option value="5000">5 秒</option>\
      <option value="10000">10 秒</option><option value="15000">15 秒</option><option value="30000">30 秒</option>\
    </select>';
    saveBtn.parentNode.insertBefore(title, saveBtn);
    saveBtn.parentNode.insertBefore(row, saveBtn);
    const select = document.getElementById('replyGlobalDelaySelect');
    select.value = String(getGlobalDelay());
    select.addEventListener('change', () => setGlobalDelay(select.value));
  }

  function injectSingleMessageDelayControl() {
    const inputBar = document.querySelector('#page-chat .input-bar');
    const moreBtn = document.getElementById('btnMore');
    if (!inputBar || !moreBtn || document.getElementById('singleReplyDelayBtn')) return;

    const btn = document.createElement('button');
    btn.id = 'singleReplyDelayBtn';
    btn.type = 'button';
    btn.style.cssText = 'width:30px;height:30px;border:0;background:transparent;padding:3px;display:flex;align-items:center;justify-content:center;position:relative;flex-shrink:0;';
    btn.innerHTML = '<svg viewBox="0 0 24 24" style="width:22px;height:22px"><circle cx="12" cy="12" r="8.5" fill="none" stroke="#666" stroke-width="1.6"/><path d="M12 7.5V12l3 2" fill="none" stroke="#666" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle id="singleReplyDelayDot" cx="19" cy="5" r="2.2" fill="transparent"/></svg>';
    inputBar.insertBefore(btn, moreBtn);

    const mask = document.createElement('div');
    mask.id = 'singleReplyDelaySheet';
    mask.className = 'mask hidden';
    mask.innerHTML = '<div class="sheet"><div class="sheet-title">下一条消息回复间隔</div><div id="singleReplyDelayChoices"></div><div class="sheet-close" id="singleReplyDelayCancel">取消</div></div>';
    document.getElementById('app')?.appendChild(mask);
    const choices = [null,0,500,1000,2000,3000,5000,10000,15000,30000];
    document.getElementById('singleReplyDelayChoices').innerHTML = choices.map(v => `<div class="menu-row" data-delay="${v === null ? 'inherit' : v}">${v === null ? '使用整体设置' : formatDelay(v)}</div>`).join('');
    btn.addEventListener('click', () => mask.classList.remove('hidden'));
    document.getElementById('singleReplyDelayCancel').addEventListener('click', () => mask.classList.add('hidden'));
    document.getElementById('singleReplyDelayChoices').addEventListener('click', e => {
      const row = e.target.closest('[data-delay]'); if (!row) return;
      nextDelayMs = row.dataset.delay === 'inherit' ? null : Number(row.dataset.delay);
      mask.classList.add('hidden');
      updateDelayButton();
    });
    updateDelayButton();
  }

  function updateDelayButton() {
    const btn = document.getElementById('singleReplyDelayBtn');
    const dot = document.getElementById('singleReplyDelayDot');
    if (!btn || !dot) return;
    const active = nextDelayMs != null;
    dot.setAttribute('fill', active ? '#07c160' : 'transparent');
    btn.title = active ? `下一条消息：${formatDelay(nextDelayMs)}` : `使用整体设置：${formatDelay(getGlobalDelay())}`;
  }
})();
