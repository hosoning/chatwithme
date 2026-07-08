const AI_CFG_KEY = 'tarot_ai_config_v1';

function getAIConfig() {
  const raw = localStorage.getItem(AI_CFG_KEY);
  const def = {
    textEnabled: false, endpoint: 'https://api.openai.com/v1/chat/completions', apiKey: '', model: 'gpt-4o-mini',
    voiceEnabled: false, voiceEndpoint: 'https://api.openai.com/v1/audio/speech', voiceApiKey: '', voiceModel: 'tts-1', voiceName: 'alloy',
    autoMsg: false, autoMoment: false, autoAvatar: false, autoRedpacket: true
  };
  return raw ? { ...def, ...JSON.parse(raw) } : def;
}
function saveAIConfig(cfg) { localStorage.setItem(AI_CFG_KEY, JSON.stringify(cfg)); }

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

// ===== 红包判定：结合抽到的牌决定是否要发红包 =====
function shouldSendRedPacket(cards) {
  const cfg = getAIConfig();
  if (!cfg.autoRedpacket) return false;
  if (!isLuckyDraw(cards)) return false;
  return secureRandomInt(100) < 40; // 命中幸运牌后仍有随机性，不是100%必发
}
function randomRedPacketAmount() {
  const cents = secureRandomInt(19999) + 1; // 0.01 ~ 200.00
  return (cents / 100).toFixed(2);
}

// ===== AI 根据抽到的塔罗牌，从头像库里挑一张头像 =====
async function pickAvatarFromCards(cards, library, persona) {
  if (!library.length) return null;
  const cardDesc = cards.map(c => `${c.name}(${c.reversed ? '逆位' : '正位'}):${c.meaning}`).join('; ');
  const libDesc = library.map((a, i) => `${i}:${a.tag || '无标签'}`).join('; ');
  const sys = `你正在扮演角色:"${persona || '一个用塔罗牌做选择的人'}"。请根据抽到的塔罗牌牌意，从头像库列表中选出一个最契合当下能量的编号，只输出数字，不要输出其他任何文字。头像库(编号:标签): ${libDesc}`;
  const result = await callLLM(sys, `抽到的塔罗牌: ${cardDesc}`);
  let idx = null;
  if (result) { const m = result.match(/\d+/); if (m) idx = parseInt(m[0]); }
  if (idx === null || idx < 0 || idx >= library.length) idx = secureRandomInt(library.length);
  return library[idx];
}