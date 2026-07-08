/*
  ============ AI 理解/决策模块 ============
  真实的"理解语义"必须依赖大模型（LLM）。
  这里提供：
  1) 本地兜底算法（无网络/无API Key时使用，基于关键词与相似度，效果有限）
  2) 预留 callLLM()，接入 OpenAI / Claude / 任意兼容接口后，
     "消息分组"、"牌意解读"、"字卡挑选"都会变成真正的语义理解。
*/

const AI_CONFIG = {
  enabled: false,          // 改成 true 并配置下面信息即可启用真实大模型
  endpoint: "https://api.openai.com/v1/chat/completions",
  apiKey: "YOUR_API_KEY_HERE",
  model: "gpt-4o-mini"
};

async function callLLM(systemPrompt, userPrompt) {
  if (!AI_CONFIG.enabled) return null;
  try {
    const res = await fetch(AI_CONFIG.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${AI_CONFIG.apiKey}`
      },
      body: JSON.stringify({
        model: AI_CONFIG.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      })
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? null;
  } catch (e) {
    console.warn("LLM调用失败，使用本地兜底逻辑", e);
    return null;
  }
}

// --- 本地兜底：简单字符相似度（Jaccard on 字符集）---
function localSimilarity(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  const inter = [...setA].filter(x => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : inter / union;
}

/**
 * 将用户连续发送的多条消息，分组成"同一件事" or "不同的事"
 * 返回: [[msg1,msg2], [msg3], ...]
 */
async function groupMessages(messages) {
  // 优先尝试真实大模型分组
  const llmResult = await callLLM(
    "你是一个语义分组助手。把用户连续发送的多条消息，按照是否属于同一个话题/同一件事分组。只输出JSON数组，例如[[0,1],[2]]，数字是消息下标。",
    JSON.stringify(messages)
  );
  if (llmResult) {
    try {
      const idxGroups = JSON.parse(llmResult);
      return idxGroups.map(g => g.map(i => messages[i]));
    } catch (e) { /* 解析失败则走本地兜底 */ }
  }

  // 本地兜底：相似度 > 0.15 且时间相近则归为一组
  const groups = [];
  let current = [messages[0]];
  for (let i = 1; i < messages.length; i++) {
    const sim = localSimilarity(messages[i - 1], messages[i]);
    if (sim > 0.15) {
      current.push(messages[i]);
    } else {
      groups.push(current);
      current = [messages[i]];
    }
  }
  groups.push(current);
  return groups;
}

/**
 * 结合 用户消息 + 抽到的塔罗牌 + 可用字卡，产出回复用的字卡序列
 */
async function interpretAndReply(userText, cards, wordCardPool) {
  const cardDesc = cards.map(c => `${c.name}(${c.reversed ? '逆位' : '正位'}): ${c.meaning}`).join('; ');

  const llmResult = await callLLM(
    `你正在扮演一个通过塔罗牌来理解和回应对话的角色。你只能使用给定的"字卡"词库中的词句来拼接回复，不能自己编造新词。
可用字卡: ${JSON.stringify(wordCardPool)}
请结合用户的消息和抽到的塔罗牌牌意，从字卡中挑选1~4个，按回复顺序输出JSON数组，例如["嗯","有点累"]。`,
    `用户消息: ${userText}\n抽到的塔罗牌: ${cardDesc}`
  );

  if (llmResult) {
    try {
      const picked = JSON.parse(llmResult);
      if (Array.isArray(picked) && picked.every(t => wordCardPool.includes(t))) {
        return picked;
      }
    } catch (e) { /* fall through */ }
  }

  // 本地兜底：根据牌是否逆位、正位数量简单挑1~2个字卡（随机但受牌面影响权重）
  const positiveCount = cards.filter(c => !c.reversed).length;
  const pool = [...wordCardPool];
  const n = positiveCount >= 2 ? 1 : 2;
  const picked = [];
  for (let i = 0; i < n && pool.length; i++) {
    const idx = secureRandomInt(pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

/**
 * 根据额外抽的3张保护罩牌，计算 0-100 的保护罩数值
 */
function calcShield(cards) {
  // 正位加分，逆位减分，大阿卡纳权重更高
  let score = 50;
  cards.forEach(c => {
    const isMajor = MAJOR_ARCANA.some(m => m.name === c.name);
    const weight = isMajor ? 12 : 7;
    score += c.reversed ? -weight : weight;
  });
  return Math.max(0, Math.min(100, score));
}