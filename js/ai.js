const AI_CFG_KEY = 'tarot_ai_config_v1';

function getAIConfig() {
  const def = {
    textEnabled: false, endpoint: 'https://api.openai.com/v1/chat/completions', apiKey: '', model: 'gpt-4o-mini',
    voiceEnabled: false, voiceProvider: 'openai', voiceEndpoint: 'https://api.openai.com/v1/audio/speech', voiceGroupId: '', voiceApiKey: '', voiceModel: 'tts-1', voiceName: 'alloy',
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

async function synthesizeVoiceOpenAI(text, cfg, key) {
  const res = await fetch(cfg.voiceEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({ model: cfg.voiceModel, voice: cfg.voiceName, input: text })
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
// MiniMax's T2A v2 API — request/response shape per MiniMax's docs as of this writing.
// If MiniMax changes their contract, this is the one place to adjust: the endpoint,
// the voice_setting/audio_setting body shape, or how the audio comes back (currently
// a hex string at data.audio) may need updating to match their current API version.
async function synthesizeVoiceMiniMax(text, cfg, key) {
  const endpoint = (cfg.voiceEndpoint && cfg.voiceEndpoint.includes('minimax'))
    ? cfg.voiceEndpoint
    : `https://api.minimax.chat/v1/t2a_v2?GroupId=${encodeURIComponent(cfg.voiceGroupId || '')}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: cfg.voiceModel || 'speech-02-turbo',
      text,
      stream: false,
      voice_setting: { voice_id: cfg.voiceName, speed: 1, vol: 1, pitch: 0 },
      audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 }
    })
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (data?.base_resp?.status_code && data.base_resp.status_code !== 0) {
    throw new Error(`MiniMax ${data.base_resp.status_code}: ${data.base_resp.status_msg || ''}`);
  }
  const hex = data?.data?.audio;
  if (!hex) throw new Error('MiniMax 响应里没有找到音频数据');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return URL.createObjectURL(new Blob([bytes], { type: 'audio/mp3' }));
}
async function synthesizeVoice(text) {
  const cfg = getAIConfig();
  if (!cfg.voiceEnabled) return null;
  const key = cfg.voiceApiKey || cfg.apiKey;
  if (!key) return null;
  try {
    return cfg.voiceProvider === 'minimax'
      ? await synthesizeVoiceMiniMax(text, cfg, key)
      : await synthesizeVoiceOpenAI(text, cfg, key);
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
  if (!messages || !messages.length) return [];
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
  if (!wordCardPool || !wordCardPool.length) return [];
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

/* ===== Reply timing + compact options + chat settings v2 ===== */
(function installChatEnhancements() {
  const GLOBAL_DELAY_KEY = 'tarot_reply_delay_ms_v1';
  let nextDelayMs = null;
  const pendingDelayByChat = Object.create(null);
  const replyContextByChat = Object.create(null);
  let settingsChatId = null;
  let wordCardContactId = null;

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
  function chevron() {
    return '<svg class="settings-v2-chevron" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function injectStyles() {
    if (document.getElementById('chatEnhancementStyles')) return;
    const style = document.createElement('style');
    style.id = 'chatEnhancementStyles';
    style.textContent = `
      .bubble.option-question-bubble{cursor:pointer;max-width:calc(16em + 28px);}
      .bubble.option-question-bubble:active{opacity:.82;}
      .option-view-mask{position:absolute;inset:0;background:rgba(0,0,0,.28);z-index:130;display:flex;align-items:flex-end;justify-content:center;}
      .option-view-sheet{width:100%;background:#f7f7f7;border-radius:18px 18px 0 0;padding:10px 12px calc(14px + env(safe-area-inset-bottom));box-shadow:0 -10px 30px rgba(0,0,0,.12);}
      .option-view-handle{width:36px;height:4px;background:#d5d5d5;border-radius:4px;margin:2px auto 12px;}
      .option-view-question{font-size:14px;color:#888;padding:0 8px 10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .option-view-list{background:#fff;border-radius:12px;overflow:hidden;}
      .option-view-row{min-height:48px;padding:12px 16px;font-size:16px;color:#111;border-bottom:.5px solid #ececec;display:flex;align-items:center;}
      .option-view-row:last-child{border-bottom:none;}
      .option-view-close{margin-top:9px;background:#fff;border-radius:12px;min-height:48px;display:flex;align-items:center;justify-content:center;color:#576b95;font-size:16px;font-weight:500;}
      .settings-v2-scroll{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:14px 12px calc(28px + env(safe-area-inset-bottom));background:#ededed;}
      .settings-v2-profile{display:flex;align-items:center;gap:13px;background:#fff;border-radius:12px;padding:16px;margin-bottom:16px;}
      .settings-v2-profile .avatar{width:52px!important;height:52px!important;}
      .settings-v2-profile-name{font-size:17px;font-weight:600;color:#111;}
      .settings-v2-profile-sub{font-size:13px;color:#999;margin-top:3px;}
      .settings-v2-group{background:#fff;border-radius:12px;overflow:hidden;margin-bottom:14px;}
      .settings-v2-row{min-height:50px;padding:0 15px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:.5px solid #ececec;font-size:16px;color:#111;touch-action:manipulation;}
      .settings-v2-row:last-child{border-bottom:none;}
      .settings-v2-row:active{background:#f7f7f7;}
      .settings-v2-right{display:flex;align-items:center;gap:6px;color:#999;font-size:14px;min-width:0;}
      .settings-v2-value{max-width:170px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .settings-v2-chevron{width:15px!important;height:15px!important;color:#c7c7cc;flex-shrink:0;}
      .settings-v2-switch{position:relative;width:46px;height:26px;display:inline-block;flex-shrink:0;}
      .settings-v2-switch input{opacity:0;width:0;height:0;position:absolute;}
      .settings-v2-switch span{position:absolute;inset:0;background:#e5e5ea;border-radius:26px;transition:.2s;}
      .settings-v2-switch span:before{content:'';position:absolute;width:22px;height:22px;left:2px;top:2px;background:#fff;border-radius:50%;transition:.2s;box-shadow:0 1px 4px rgba(0,0,0,.25);}
      .settings-v2-switch input:checked+span{background:#07c160;}
      .settings-v2-switch input:checked+span:before{transform:translateX(20px);}
      .settings-v2-danger{color:#fa5151!important;justify-content:center;font-weight:500;}
      .settings-v2-editor{padding:14px 12px 30px;background:#ededed;flex:1;overflow-y:auto;}
      .settings-v2-card{background:#fff;border-radius:12px;padding:14px;margin-bottom:14px;}
      .settings-v2-card label{display:block;color:#777;font-size:13px;margin-bottom:8px;}
      .settings-v2-card textarea,.settings-v2-card input,.settings-v2-card select{width:100%;border:none;background:#f7f7f7;border-radius:9px;padding:11px 12px;font-size:15px;outline:none;user-select:text!important;-webkit-user-select:text!important;}
      .settings-v2-save{border:none;background:#07c160;color:#fff;width:100%;height:46px;border-radius:10px;font-size:16px;font-weight:500;}
      .wordcard-v2-add{display:flex;gap:8px;background:#fff;border-radius:12px;padding:10px;margin-bottom:12px;}
      .wordcard-v2-add input{flex:1;border:none;background:#f5f5f5;border-radius:8px;padding:10px;font-size:15px;user-select:text!important;-webkit-user-select:text!important;outline:none;}
      .wordcard-v2-add button{border:none;background:#07c160;color:#fff;border-radius:8px;padding:0 14px;font-size:14px;}
      .wordcard-v2-list{background:#fff;border-radius:12px;overflow:hidden;}
      .wordcard-v2-row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:48px;padding:10px 14px;border-bottom:.5px solid #ececec;font-size:15px;}
      .wordcard-v2-row:last-child{border-bottom:none;}
      .wordcard-v2-delete{border:none;background:#f1f1f1;color:#999;width:26px;height:26px;border-radius:13px;font-size:17px;flex-shrink:0;}
      .wordcard-v2-empty{padding:34px 15px;text-align:center;color:#aaa;font-size:14px;}
    `;
    document.head.appendChild(style);
  }

  function ensureOptionViewer() {
    if (document.getElementById('optionViewerV2')) return;
    const mask = document.createElement('div');
    mask.id = 'optionViewerV2';
    mask.className = 'option-view-mask hidden';
    mask.innerHTML = '<div class="option-view-sheet"><div class="option-view-handle"></div><div class="option-view-question" id="optionViewerQuestion"></div><div class="option-view-list" id="optionViewerList"></div><div class="option-view-close" id="optionViewerClose">关闭</div></div>';
    document.getElementById('app')?.appendChild(mask);
    mask.addEventListener('click', e => { if (e.target === mask) mask.classList.add('hidden'); });
    document.getElementById('optionViewerClose')?.addEventListener('click', () => mask.classList.add('hidden'));
  }

  function openOptionViewer(msgId) {
    const chatId = state.activeChatId;
    const msg = (state.chats[chatId] || []).find(m => String(m.id) === String(msgId));
    if (!msg || msg.type !== 'options') return;
    ensureOptionViewer();
    document.getElementById('optionViewerQuestion').textContent = msg.question || msg.text || '选项';
    document.getElementById('optionViewerList').innerHTML = (msg.options || []).map((o, i) => `<div class="option-view-row"><span style="color:#aaa;width:24px;flex-shrink:0;">${i + 1}</span><span>${escapeHtml(o)}</span></div>`).join('') + '<div class="option-view-row" style="color:#999;"><span style="width:24px;flex-shrink:0;">—</span><span>其他</span></div>';
    document.getElementById('optionViewerV2').classList.remove('hidden');
  }

  function ensureSettingsPages() {
    const app = document.getElementById('app');
    if (!app || document.getElementById('page-chat-settings-v2')) return;
    app.insertAdjacentHTML('beforeend', `
      <div class="page hidden" id="page-chat-settings-v2">
        <div class="nav-bar"><svg class="icon-btn nav-back" id="backFromChatSettingsV2" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="nav-title">聊天设置</span><span style="width:25px"></span></div>
        <div class="settings-v2-scroll" id="chatSettingsV2Body"></div>
      </div>
      <div class="page hidden" id="page-chat-setting-detail-v2">
        <div class="nav-bar"><svg class="icon-btn nav-back" id="backFromChatSettingDetailV2" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="nav-title" id="chatSettingDetailTitleV2">设置</span><span style="width:25px"></span></div>
        <div class="settings-v2-editor" id="chatSettingDetailBodyV2"></div>
      </div>
      <div class="page hidden" id="page-chat-wordcards-v2">
        <div class="nav-bar"><svg class="icon-btn nav-back" id="backFromChatWordCardsV2" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="nav-title">专属字卡</span><span style="width:25px"></span></div>
        <div class="settings-v2-editor"><div class="wordcard-v2-add"><input id="wordCardV2Input" placeholder="添加一条字卡"><button id="wordCardV2AddBtn">添加</button></div><div class="wordcard-v2-list" id="wordCardV2List"></div></div>
      </div>
    `);
    document.getElementById('backFromChatSettingsV2')?.addEventListener('click', () => popPage());
    document.getElementById('backFromChatSettingDetailV2')?.addEventListener('click', () => popPage());
    document.getElementById('backFromChatWordCardsV2')?.addEventListener('click', () => popPage());
    document.getElementById('chatSettingsV2Body')?.addEventListener('click', handleSettingsClick);
    document.getElementById('chatSettingsV2Body')?.addEventListener('change', handleSettingsChange);
    document.getElementById('wordCardV2AddBtn')?.addEventListener('click', addWordCardV2);
    document.getElementById('wordCardV2Input')?.addEventListener('keydown', e => { if (e.key === 'Enter') addWordCardV2(); });
    document.getElementById('wordCardV2List')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-delete-card]');
      if (!btn || !wordCardContactId) return;
      WordCards.removeContactCard(wordCardContactId, btn.dataset.deleteCard);
      renderWordCardsV2();
      renderChatSettingsV2();
    });
  }

  function openChatSettingsV2() {
    const chatId = state.activeChatId;
    if (!chatId) return;
    settingsChatId = chatId;
    const old = document.getElementById('chatSettingsSheet');
    if (old) old.classList.add('hidden');
    ensureSettingsPages();
    renderChatSettingsV2();
    pushPage('page-chat-settings-v2');
  }

  function renderChatSettingsV2() {
    const body = document.getElementById('chatSettingsV2Body');
    if (!body || !settingsChatId) return;
    const pinned = isChatPinned(settingsChatId);
    if (isGroupChat(settingsChatId)) {
      const g = getGroupById(settingsChatId.slice(2));
      if (!g) return;
      body.innerHTML = `
        <div class="settings-v2-profile"><div class="avatar" style="background:${hashColor(g.name)}">${escapeHtml(g.name || '?').slice(0,1)}</div><div><div class="settings-v2-profile-name">${escapeHtml(g.name)}</div><div class="settings-v2-profile-sub">${g.memberIds?.length || 0} 位成员</div></div></div>
        <div class="settings-v2-group">
          <div class="settings-v2-row" data-setting="group-name"><span>群聊名称</span><div class="settings-v2-right"><span class="settings-v2-value">${escapeHtml(g.name)}</span>${chevron()}</div></div>
          <div class="settings-v2-row"><span>置顶聊天</span><label class="settings-v2-switch"><input id="chatPinSwitchV2" type="checkbox" ${pinned?'checked':''}><span></span></label></div>
        </div>
        <div class="settings-v2-group"><div class="settings-v2-row" data-setting="clear-chat"><span>清空聊天记录</span>${chevron()}</div></div>
        <div class="settings-v2-group"><div class="settings-v2-row settings-v2-danger" data-setting="delete-chat">解散群聊</div></div>`;
    } else {
      const c = getContactById(settingsChatId);
      if (!c) return;
      const customCount = WordCards.getContactList(c.id).length;
      body.innerHTML = `
        <div class="settings-v2-profile">${avatarHtml(c.avatar, c.name, 52)}<div><div class="settings-v2-profile-name">${escapeHtml(c.name)}</div><div class="settings-v2-profile-sub">角色聊天设置</div></div></div>
        <div class="settings-v2-group">
          <div class="settings-v2-row" data-setting="persona"><span>角色设定</span><div class="settings-v2-right"><span class="settings-v2-value">${escapeHtml(c.persona || '未设置')}</span>${chevron()}</div></div>
          <div class="settings-v2-row" data-setting="wordcards"><span>专属字卡</span><div class="settings-v2-right"><span>${customCount ? `${customCount} 条` : '未添加'}</span>${chevron()}</div></div>
          <div class="settings-v2-row"><span>叠加专属字卡</span><label class="settings-v2-switch"><input id="wordCardModeSwitchV2" type="checkbox" ${c.wordCardMode === 'custom' ? 'checked' : ''}><span></span></label></div>
        </div>
        <div class="settings-v2-group">
          <div class="settings-v2-row" data-setting="global-delay"><span>回复间隔</span><div class="settings-v2-right"><span>${formatDelay(getGlobalDelay())}</span>${chevron()}</div></div>
          <div class="settings-v2-row"><span>置顶聊天</span><label class="settings-v2-switch"><input id="chatPinSwitchV2" type="checkbox" ${pinned?'checked':''}><span></span></label></div>
        </div>
        <div class="settings-v2-group"><div class="settings-v2-row" data-setting="clear-chat"><span>清空聊天记录</span>${chevron()}</div></div>
        <div class="settings-v2-group"><div class="settings-v2-row settings-v2-danger" data-setting="delete-chat">删除角色与聊天</div></div>`;
    }
  }

  function handleSettingsChange(e) {
    if (!settingsChatId) return;
    if (e.target.id === 'chatPinSwitchV2') {
      const currentlyPinned = isChatPinned(settingsChatId);
      if (e.target.checked !== currentlyPinned) toggleChatPinned(settingsChatId);
      persist(); renderChatList();
      return;
    }
    if (e.target.id === 'wordCardModeSwitchV2' && !isGroupChat(settingsChatId)) {
      const c = getContactById(settingsChatId);
      if (c) { c.wordCardMode = e.target.checked ? 'custom' : 'global'; persist(); }
    }
  }

  function handleSettingsClick(e) {
    const row = e.target.closest('[data-setting]');
    if (!row || !settingsChatId) return;
    const action = row.dataset.setting;
    if (action === 'persona') return openPersonaEditorV2();
    if (action === 'wordcards') return openWordCardsV2();
    if (action === 'global-delay') return openDelayEditorV2();
    if (action === 'group-name') return openGroupNameEditorV2();
    if (action === 'clear-chat') {
      if (!confirm('确定清空这个聊天的全部记录？')) return;
      state.chats[settingsChatId] = [];
      persist(); renderMessages(); renderChatList();
      return;
    }
    if (action === 'delete-chat') {
      if (isGroupChat(settingsChatId)) {
        const g = getGroupById(settingsChatId.slice(2));
        if (!g || !confirm(`确定解散群聊「${g.name}」？`)) return;
        state.groups = state.groups.filter(x => x.id !== g.id);
      } else {
        const c = getContactById(settingsChatId);
        if (!c || !confirm(`确定删除角色「${c.name}」和聊天记录？`)) return;
        state.contacts = state.contacts.filter(x => String(x.id) !== String(c.id));
      }
      delete state.chats[settingsChatId];
      delete state.unread[settingsChatId];
      persist();
      state.activeChatId = null;
      renderChatList(); renderContactList();
      switchTab('chat', 'page-chatlist');
    }
  }

  function openPersonaEditorV2() {
    const c = getContactById(settingsChatId);
    if (!c) return;
    document.getElementById('chatSettingDetailTitleV2').textContent = '角色设定';
    const body = document.getElementById('chatSettingDetailBodyV2');
    body.innerHTML = `<div class="settings-v2-card"><label>角色性格 / 说话方式</label><textarea id="personaEditorV2" rows="9" placeholder="描述角色性格、关系、语气等">${escapeHtml(c.persona || '')}</textarea></div><button class="settings-v2-save" id="personaSaveV2">保存</button>`;
    body.querySelector('#personaSaveV2').addEventListener('click', () => { c.persona = body.querySelector('#personaEditorV2').value.trim(); persist(); renderChatSettingsV2(); popPage(); });
    pushPage('page-chat-setting-detail-v2');
  }

  function openDelayEditorV2() {
    document.getElementById('chatSettingDetailTitleV2').textContent = '回复间隔';
    const body = document.getElementById('chatSettingDetailBodyV2');
    body.innerHTML = `<div class="settings-v2-card"><label>整体回复间隔</label><select id="delayEditorV2"><option value="0">立即</option><option value="500">0.5 秒</option><option value="1000">1 秒</option><option value="2000">2 秒</option><option value="3000">3 秒</option><option value="5000">5 秒</option><option value="10000">10 秒</option><option value="15000">15 秒</option><option value="30000">30 秒</option></select></div><button class="settings-v2-save" id="delaySaveV2">保存</button>`;
    body.querySelector('#delayEditorV2').value = String(getGlobalDelay());
    body.querySelector('#delaySaveV2').addEventListener('click', () => { setGlobalDelay(body.querySelector('#delayEditorV2').value); updateDelayButton(); renderChatSettingsV2(); popPage(); });
    pushPage('page-chat-setting-detail-v2');
  }

  function openGroupNameEditorV2() {
    const g = getGroupById(settingsChatId.slice(2));
    if (!g) return;
    document.getElementById('chatSettingDetailTitleV2').textContent = '群聊名称';
    const body = document.getElementById('chatSettingDetailBodyV2');
    body.innerHTML = `<div class="settings-v2-card"><label>群聊名称</label><input id="groupNameEditorV2" value="${escapeHtml(g.name || '')}" maxlength="30"></div><button class="settings-v2-save" id="groupNameSaveV2">保存</button>`;
    body.querySelector('#groupNameSaveV2').addEventListener('click', () => { const v=body.querySelector('#groupNameEditorV2').value.trim(); if(v){g.name=v;persist();document.getElementById('chatPeerName').textContent=v;renderChatList();renderChatSettingsV2();popPage();} });
    pushPage('page-chat-setting-detail-v2');
  }

  function openWordCardsV2() {
    if (isGroupChat(settingsChatId)) return;
    wordCardContactId = settingsChatId;
    renderWordCardsV2();
    pushPage('page-chat-wordcards-v2');
  }
  function renderWordCardsV2() {
    const box = document.getElementById('wordCardV2List');
    if (!box || !wordCardContactId) return;
    const list = WordCards.getContactList(wordCardContactId);
    box.innerHTML = list.length ? list.map(t => `<div class="wordcard-v2-row"><span>${escapeHtml(t)}</span><button class="wordcard-v2-delete" data-delete-card="${escapeHtml(t)}">×</button></div>`).join('') : '<div class="wordcard-v2-empty">还没有专属字卡</div>';
  }
  function addWordCardV2() {
    const input = document.getElementById('wordCardV2Input');
    const text = input?.value.trim();
    if (!text || !wordCardContactId) return;
    WordCards.addContactCard(wordCardContactId, text);
    input.value = '';
    renderWordCardsV2(); renderChatSettingsV2();
  }

  function injectGlobalDelaySetting() {
    const saveBtn = document.getElementById('saveSettingsBtn');
    if (!saveBtn || document.getElementById('replyGlobalDelaySelect')) return;
    const title = document.createElement('div');
    title.className = 'settings-group-title'; title.textContent = '回复速度';
    const row = document.createElement('div');
    row.className = 'form-row col';
    row.innerHTML = '<label>整体回复间隔</label><select id="replyGlobalDelaySelect"><option value="0">立即</option><option value="500">0.5 秒</option><option value="1000">1 秒</option><option value="2000">2 秒</option><option value="3000">3 秒</option><option value="5000">5 秒</option><option value="10000">10 秒</option><option value="15000">15 秒</option><option value="30000">30 秒</option></select>';
    saveBtn.parentNode.insertBefore(title, saveBtn); saveBtn.parentNode.insertBefore(row, saveBtn);
    const select = document.getElementById('replyGlobalDelaySelect'); select.value = String(getGlobalDelay()); select.addEventListener('change', () => setGlobalDelay(select.value));
  }

  function injectSingleMessageDelayControl() {
    const inputBar = document.querySelector('#page-chat .input-bar');
    const moreBtn = document.getElementById('btnMore');
    if (!inputBar || !moreBtn || document.getElementById('singleReplyDelayBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'singleReplyDelayBtn'; btn.type = 'button';
    btn.style.cssText = 'width:30px;height:30px;border:0;background:transparent;padding:3px;display:flex;align-items:center;justify-content:center;position:relative;flex-shrink:0;';
    btn.innerHTML = '<svg viewBox="0 0 24 24" style="width:22px;height:22px"><circle cx="12" cy="12" r="8.5" fill="none" stroke="#666" stroke-width="1.6"/><path d="M12 7.5V12l3 2" fill="none" stroke="#666" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle id="singleReplyDelayDot" cx="19" cy="5" r="2.2" fill="transparent"/></svg>';
    inputBar.insertBefore(btn, moreBtn);
    const mask = document.createElement('div');
    mask.id = 'singleReplyDelaySheet'; mask.className = 'mask hidden';
    mask.innerHTML = '<div class="sheet"><div class="sheet-title">下一条消息回复间隔</div><div id="singleReplyDelayChoices"></div><div class="sheet-close" id="singleReplyDelayCancel">取消</div></div>';
    document.getElementById('app')?.appendChild(mask);
    const choices = [null,0,500,1000,2000,3000,5000,10000,15000,30000];
    document.getElementById('singleReplyDelayChoices').innerHTML = choices.map(v => `<div class="menu-row" data-delay="${v === null ? 'inherit' : v}">${v === null ? '使用整体设置' : formatDelay(v)}</div>`).join('');
    btn.addEventListener('click', () => mask.classList.remove('hidden'));
    document.getElementById('singleReplyDelayCancel').addEventListener('click', () => mask.classList.add('hidden'));
    document.getElementById('singleReplyDelayChoices').addEventListener('click', e => { const row=e.target.closest('[data-delay]'); if(!row)return; nextDelayMs=row.dataset.delay==='inherit'?null:Number(row.dataset.delay); mask.classList.add('hidden'); updateDelayButton(); });
    updateDelayButton();
  }
  function updateDelayButton() {
    const btn = document.getElementById('singleReplyDelayBtn'); const dot = document.getElementById('singleReplyDelayDot');
    if (!btn || !dot) return;
    const active = nextDelayMs != null; dot.setAttribute('fill', active ? '#07c160' : 'transparent');
    btn.title = active ? `下一条消息：${formatDelay(nextDelayMs)}` : `使用整体设置：${formatDelay(getGlobalDelay())}`;
  }

  window.addEventListener('load', () => setTimeout(() => {
    if (typeof handleSend !== 'function' || typeof replyWithTarot !== 'function') return;
    window.state = state;
    injectStyles(); ensureOptionViewer(); ensureSettingsPages();

    const originalHandleSend = handleSend;
    const originalProcessSingleBatch = processSingleBatch;
    const originalProcessGroupBatch = processGroupBatch;
    const originalRenderMessages = renderMessages;

    window.handleSend = function(text) {
      const chatId = state.activeChatId;
      if (chatId && nextDelayMs != null) { pendingDelayByChat[chatId] = nextDelayMs; nextDelayMs = null; updateDelayButton(); }
      return originalHandleSend(text);
    };
    window.processSingleBatch = async function(contactId) {
      replyContextByChat[contactId] = pendingDelayByChat[contactId] != null ? pendingDelayByChat[contactId] : getGlobalDelay(); delete pendingDelayByChat[contactId];
      try { return await originalProcessSingleBatch(contactId); } finally { delete replyContextByChat[contactId]; }
    };
    window.processGroupBatch = async function(groupId) {
      replyContextByChat[groupId] = pendingDelayByChat[groupId] != null ? pendingDelayByChat[groupId] : getGlobalDelay(); delete pendingDelayByChat[groupId];
      try { return await originalProcessGroupBatch(groupId); } finally { delete replyContextByChat[groupId]; }
    };
    window.replyWithTarot = async function(chatId, fromId, text, persona) {
      const cards = drawCards(3), shieldCards = drawCards(3), shield = calcShield(shieldCards), contact = getContactById(fromId), pool = WordCards.getForContact(contact), delayMs = getReplyDelay(chatId);
      showTypingIndicator(chatId, contact);
      try {
        await sleep(delayMs);
        if (shouldSendRedPacket(cards)) { const amount=randomRedPacketAmount(), note=pool[secureRandomInt(pool.length)]||'恭喜发财'; addMessage(chatId,fromId,note,{type:'redpacket',cards,shieldCards,shield,redpacket:{amount,note,status:'unclaimed',claimedBy:null}}); return; }
        const picks = await interpretAndReply(text,cards,pool,persona); const safePicks = Array.isArray(picks)&&picks.length?picks:[(pool&&pool.length?pool[secureRandomInt(pool.length)]:'嗯')];
        for(let i=0;i<safePicks.length;i++){ if(i>0){showTypingIndicator(chatId,contact);await sleep(delayMs);} const voiceUrl=await synthesizeVoice(safePicks[i]); addMessage(chatId,fromId,safePicks[i],{cards,shieldCards,shield,voiceUrl}); }
      } finally { hideTypingIndicator(); }
    };
    window.sendOptionsMessage = function(chatId, options) {
      const question=(document.getElementById('optionsQuestionInput')?.value||'').trim();
      addMessage(chatId,'me',question||'请选择',{type:'options',options,question:question||'请选择'});
      let responder=chatId;
      if(isGroupChat(chatId)){const g=getGroupById(chatId.slice(2));if(!g?.memberIds?.length)return;responder=g.memberIds[secureRandomInt(g.memberIds.length)];}
      if(!responder)return;
      replyContextByChat[chatId]=nextDelayMs!=null?nextDelayMs:getGlobalDelay(); nextDelayMs=null; updateDelayButton();
      window.replyToOptions(chatId,responder,options,getContactById(responder)?.persona,question).finally(()=>{delete replyContextByChat[chatId];});
    };
    window.replyToOptions = async function(chatId, fromId, options, persona, question='') {
      const contact=getContactById(fromId); showTypingIndicator(chatId,contact);
      try{
        await sleep(getReplyDelay(chatId)); const idx=secureRandomInt(options.length+1);
        if(idx===options.length){ hideTypingIndicator(); await window.replyWithTarot(chatId,fromId,`${question?`问题：${question}；`:''}可选项：${options.join('、')}；选择其他并自然回应`,persona); return; }
        const cards=drawCards(3),shieldCards=drawCards(3),shield=calcShield(shieldCards),answer=options[idx],voiceUrl=await synthesizeVoice(answer);
        addMessage(chatId,fromId,answer,{cards,shieldCards,shield,voiceUrl,optionAnswerTo:question||null});
      }finally{hideTypingIndicator();}
    };
    window.renderMessages = function() {
      const out=originalRenderMessages.apply(this,arguments); const chatId=state.activeChatId; const msgs=state.chats[chatId]||[];
      document.querySelectorAll('#msgList .msg-row').forEach(row=>{
        const msg=msgs.find(m=>String(m.id)===String(row.dataset.id)); if(!msg||msg.type!=='options')return;
        const bubble=row.querySelector('.bubble'); if(!bubble)return;
        bubble.className='bubble option-question-bubble'; bubble.textContent=msg.question||msg.text||'请选择'; bubble.dataset.optionsMsg=String(msg.id);
      });
      return out;
    };

    const optionsList=document.getElementById('optionsInputList');
    if(optionsList&&!document.getElementById('optionsQuestionInput')){const wrap=document.createElement('div');wrap.className='form-row col';wrap.style.marginBottom='12px';wrap.innerHTML='<label>问题</label><input id="optionsQuestionInput" maxlength="60" placeholder="例如：今晚想吃什么？">';optionsList.parentNode.insertBefore(wrap,optionsList);}
    const originalOpenSendOptions=openSendOptions;
    window.openSendOptions=function(){const r=originalOpenSendOptions.apply(this,arguments);const q=document.getElementById('optionsQuestionInput');if(q)q.value='';return r;};

    document.getElementById('msgList')?.addEventListener('click',e=>{const b=e.target.closest('[data-options-msg]');if(b){e.stopPropagation();openOptionViewer(b.dataset.optionsMsg);}},true);
    document.getElementById('btnChatSettings')?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();openChatSettingsV2();},true);

    injectGlobalDelaySetting(); injectSingleMessageDelayControl(); window.renderMessages();
  },0));
})();
