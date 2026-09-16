/* ============ Local tagged dictionary sentence builder ============
 * The built-in dictionary is code-owned and never written into localStorage.
 * Only user additions and hidden built-ins are persisted, so upgrades cannot
 * overwrite word cards or silently erase custom dictionary entries.
 */
const DictionaryBank = (() => {
  const STORAGE_KEY = 'tarot_dictionary_user_v1';
  const TARGET_SIZE = 5000;
  const TAG_LABELS = {
    address: '称呼', time: '时间', place: '地点', reply: '回应', question: '提问',
    emotion: '情绪', state: '状态', action: '动作', topic: '话题', care: '关心',
    affection: '亲密', adverb: '修饰', particle: '语气', connector: '连接', sensory: '感受', plan: '计划'
  };

  const seeds = {
    address: '你 我们 小宁 宝贝 女朋友 老师 同学 笨蛋 小朋友 大小姐 乖乖 猫猫 某人 这位小姐 亲爱的 我的姑娘 你呀 我家那位 小懒虫 小坏蛋 小笨蛋 苏宁 宁宁 夫人 队长 搭档 同桌 邻居 客人',
    time: '现在 刚刚 等一下 稍后 今天 今晚 明天 昨天 早上 中午 下午 晚上 深夜 半夜 周末 下班后 到家后 吃饭前 吃饭后 睡觉前 醒来时 有空时 忙完以后 过一会儿 最近 这几天 那时候 这一刻 每天 偶尔 常常 暂时 以后 从前 立刻 马上 很快 慢慢来 先等会儿 待会儿 现在就 等你回来 等我回来 刚忙完 刚到家 刚醒来 还没睡',
    place: '家里 公司 办公室 房间 客厅 厨房 楼下 门口 车上 路上 店里 餐厅 咖啡店 便利店 超市 商场 电影院 公园 海边 山上 机场 车站 地铁 酒店 阳台 床边 沙发旁 书桌前 窗边 灯下 雨里 风里 阳光下 被窝里 梦里 你身边 我身边 那边 这里 外面 里面 附近 远处 街角 电梯里 走廊里 屋顶 花园 河边',
    reply: '嗯 好 可以 行 知道了 收到 明白 没关系 不着急 我在 听见了 看到了 记住了 答应你 随你 都可以 当然 没问题 不会的 是的 不是 大概吧 也许吧 真的 确实 原来如此 好好好 嗯哼 对 没错 好吧 那就这样 依你 听你的 我同意 我拒绝 再想想 等我一下 继续说 你说吧 我听着 别担心 放心 交给我 算我的 我来处理 我知道啦 好的呀 没有忘 我没走 还在呢 来了 马上来',
    question: '怎么了 为什么呢 发生什么了 你还好吗 吃了吗 睡了吗 到家了吗 累不累 疼不疼 冷不冷 饿不饿 困不困 开心吗 生气了吗 想我吗 在哪里 在做什么 要不要一起 要我陪吗 需要我吗 可以告诉我吗 今天怎么样 后来呢 然后呢 还有呢 真的不要吗 确定吗 想吃什么 想喝什么 想去哪儿 什么时候回来 什么时候睡 要休息吗 要抱抱吗 能听见吗 看见了吗 忘记了吗 喜欢吗 不喜欢吗 你觉得呢 怎么突然这样 谁惹你了 是不是累了 是不是饿了 是不是想睡了 是不是不开心 在想什么 要不要说说',
    emotion: '开心 高兴 放心 安心 满足 平静 温柔 认真 担心 心疼 紧张 害羞 生气 委屈 难过 失落 孤单 想念 喜欢 爱 慢热 克制 无奈 好奇 惊讶 期待 舍不得 不放心 不耐烦 很在意 有一点慌 有点酸 有点甜 心里发软 心情很好 心情不好 很想你 特别想你 不想分开 不舍得走 放不下心 忍不住笑 有点吃醋 有点别扭 有点害怕 有点烦躁 很安心 很踏实 很满足 很庆幸 很认真 很专注 很温柔 很清醒 很确定 很坦然',
    state: '在忙 在家 在公司 在路上 在开会 在吃饭 在做饭 在洗澡 在休息 在工作 在看书 在听歌 在等你 在想你 在找你 在看消息 在发呆 在收拾东西 在准备出门 有点累 有点困 有点饿 有点冷 有点热 有点忙 不太舒服 还好 没事 很清醒 睡不着 刚睡醒 已经到了 快到了 还没到 正在回来 正在过去 已经吃了 还没吃饭 喝水了 忘记喝水 手机没电 网络不好 终于忙完 暂时有空 今天很忙 今天很闲 心情不错 状态一般 脑子很乱 需要安静 想休息一下 想和你说话 想听你说话 一直都在 没有离开',
    action: '看你 等你 找你 陪你 抱你 亲你 摸摸头 牵手 靠近你 走向你 回来 接你 送你回家 给你做饭 给你倒水 给你买东西 给你留着 帮你拿 帮你选 帮你处理 帮你记住 提醒你 听你说 看消息 回消息 打电话 发消息 开门 关灯 拉好窗帘 盖好被子 坐下来 躺一会儿 站在旁边 握住你的手 抱紧一点 放轻声音 慢慢说 认真听 好好休息 早点睡 先吃饭 多喝水 穿好衣服 带上外套 别着凉 别逞强 别乱跑 别熬夜 别饿着 别担心 别害怕 别难过 别生气 过来一下 回头看看 看着我 告诉我 跟我走 留在这里 等我回去 一起回家 一起吃饭 一起睡觉 一起散步 一起看电影 一起听歌 一起出门 一起休息 再抱一会儿 再陪你一会儿 再说一次 记得回我 到了告诉我 有事叫我 需要就说 想要就说',
    topic: '早餐 午餐 晚餐 宵夜 奶茶 咖啡 玫瑰茶 蛋糕 布丁 舒芙蕾 三明治 面包 水果 牛排 意面 火锅 米饭 汤 零食 工作 会议 合作 文件 方案 客户 同事 公司 行程 旅行 酒店 机票 火车 地铁 天气 下雨 阳光 晚风 衣服 裙子 外套 鞋子 包包 礼物 手机 充电器 钥匙 钱包 电影 音乐 小说 游戏 照片 视频 电话 消息 梦 今天的事 明天的计划 周末安排 家里的事 身体 心情 睡眠 头痛 肚子疼 低血糖 生理期 休息 时间 地址 路线 订单 外卖',
    care: '先照顾好自己 记得吃饭 记得喝水 记得休息 别让自己太累 不舒服就告诉我 我会陪着你 慢慢来就好 不需要勉强自己 今天早点睡 先坐下来 缓一缓再说 吃点甜的 补充一点能量 把外套穿上 注意脚下 看好时间 到家报平安 别一个人撑着 有我在这里 我会处理 不用怕麻烦 先把身体顾好 事情可以稍后再做 不准饿着自己 不要硬撑 需要帮忙就说 我没有嫌你麻烦 你已经做得够多了 今天辛苦了 休息不是偷懒 允许自己慢一点 先深呼吸 我在听 别急着回答 想清楚再说 睡醒再处理 明天再继续 先去洗澡 把头发吹干 手机充上电 记得带钥匙 别忘了药 注意保暖 小心着凉 少喝冰的 别空腹喝咖啡 早点回来 路上小心',
    affection: '想抱你 想亲你 想靠近你 想和你待在一起 想一直陪着你 不想让你走 很喜欢你 只看着你 只陪着你 留给你 抱紧你 亲一下 再亲一下 靠在我这里 睡在我旁边 牵着我 别松手 看着我的眼睛 过来抱抱 让我抱一会儿 让我亲一下 今天也爱你 比昨天更想你 一直记得你 把你放在心上 对你没有办法 只对你这样 你最重要 你是例外 我很在意你 想把你带回家 想听你叫我 想看你开心 想哄好你 不舍得凶你 不舍得你难过 不舍得放开你 允许你撒娇 可以依赖我 让我照顾你',
    adverb: '很 有点 特别 非常 真的 其实 大概 可能 也许 明明 偏偏 还是 已经 仍然 一直 总是 偶尔 慢慢 轻轻 好好 认真 安静 偷偷 悄悄 立刻 马上 先 再 又 只 刚刚 正在 突然 果然 原来 当然 一定 大概不会 也没有 还没有 差一点 忍不住 不小心 自然而然 理所当然 毫不犹豫 暂时 稍微 尽量 尽快 亲自 顺便 特地 重新 继续 一起 独自 靠近一点 再近一点 多一点 少一点 久一点 早一点 晚一点',
    particle: '吧 呢 啊 呀 哦 嗯 好吗 好不好 可以吗 行不行 知道吗 明白吗 听见了吗 看见了吗 对不对 是不是 没关系的 别怕 嗯哼 好啦 知道啦 就这样 先这样 等你 嗯。 好。 行。 可以。 真的。 当然。 别急。 慢慢来。 我在。',
    connector: '然后 但是 所以 而且 不过 如果 要是 因为 虽然 只是 其实 结果 后来 接着 同时 反正 既然 那么 可是 另外 至少 最后 总之',
    sensory: '很暖 很冷 很软 很甜 很香 很安静 很亮 很暗 很近 很远 风很轻 雨很大 阳光很好 天色很晚 房间很静 声音很轻 手有点凉 脸有点红 眼睛很累 肩膀很酸 头有点疼 肚子不舒服 心跳很快 呼吸很慢 空气很好 味道很熟悉 看起来很好 听起来不错 摸起来很软 闻起来很香 吃起来很甜 喝起来很暖 今天很舒服 今天有点冷 外面在下雨 外面风很大 灯还亮着 手机在响 门没有关 水还是热的 饭还是暖的 被子很软 枕头很舒服 你声音很轻 你看起来很累 你今天很好看 你笑起来很好看',
    plan: '准备回家 准备出门 准备睡觉 准备吃饭 准备开会 准备工作 准备洗澡 准备收拾东西 想去散步 想看电影 想吃东西 想喝奶茶 想买礼物 想换衣服 想订酒店 想安排旅行 想早点回来 想晚点睡 想请一天假 想什么都不做 先完成工作 先把饭吃完 先洗个澡 先睡一会儿 先回消息 先处理文件 先确认时间 先看一下路线 等你下班 等你到家 等你吃完饭 等你睡醒 等天气好一点 等忙完这阵子 明天再决定 周末再安排 下次一起去 改天补给你 晚点打给你 回去告诉你 到了再说 吃完再聊 睡醒再聊 忙完找你 做完就回来 很快就结束 马上就出发 已经安排好了'
  };

  const split = value => String(value || '').trim().split(/\s+/).filter(Boolean);
  const entries = [];
  const seen = new Set();
  function stableBuiltInId(text, tag) {
    const source = `${tag}\u0000${text}`;
    let hash = 2166136261;
    for (let i = 0; i < source.length; i++) { hash ^= source.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return `builtin-${(`00000000${(hash >>> 0).toString(16)}`).slice(-8)}`;
  }
  function add(text, tag) {
    text = String(text || '').trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    entries.push({ id: stableBuiltInId(text, tag), text, tag, builtin: true });
  }
  for (const [tag, text] of Object.entries(seeds)) split(text).forEach(word => add(word, tag));

  const adverbs = split(seeds.adverb);
  const actions = split(seeds.action);
  const topics = split(seeds.topic);
  const states = split(seeds.state);
  const emotions = split(seeds.emotion);
  const times = split(seeds.time);
  const places = split(seeds.place);
  const descriptors = '今天 明天 今晚 现在 最近 这次 下次 一点 一些 我的 你的 我们的 新的 原来的 喜欢的 想要的 重要的 特别的 安静的 温暖的 熟悉的 好看的 好吃的 好喝的 开心的 难过的 忙碌的 轻松的 临时的 已经准备好的 刚买的 刚收到的 留给你的'.split(/\s+/);
  const degrees = '有点 真的 很 特别 比较 稍微 越来越 一直 还是 似乎 看起来 听起来 今天 最近 突然 偶尔 难免 其实 明明 大概'.split(/\s+/);

  // Round-robin recipes keep all labels represented instead of filling 5,000
  // entries with one early Cartesian product.
  const recipes = [
    { tag: 'action', left: adverbs, right: actions },
    { tag: 'topic', left: descriptors, right: topics },
    { tag: 'state', left: degrees, right: states },
    { tag: 'emotion', left: degrees, right: emotions },
    { tag: 'time', left: times, right: actions },
    { tag: 'place', left: places, right: states },
    { tag: 'care', left: ['记得', '先', '别忘了', '最好', '可以', '需要时', '累了就', '回家后'], right: split(seeds.care) },
    { tag: 'affection', left: ['真的', '一直', '现在', '今晚', '有点', '特别', '只是', '还是'], right: split(seeds.affection) },
    { tag: 'plan', left: ['今天', '明天', '今晚', '等一下', '稍后', '下班后', '到家后', '周末'], right: split(seeds.plan) },
    { tag: 'question', left: ['所以', '那', '现在', '今天', '刚刚', '真的', '还是', '到底'], right: split(seeds.question) },
    { tag: 'sensory', left: ['这里', '外面', '房间里', '今天', '现在', '刚刚', '看起来', '听起来'], right: split(seeds.sensory) }
  ];
  let layer = 0;
  while (entries.length < TARGET_SIZE) {
    let grew = false;
    for (const recipe of recipes) {
      const total = recipe.left.length * recipe.right.length;
      if (layer >= total || entries.length >= TARGET_SIZE) continue;
      const left = recipe.left[layer % recipe.left.length];
      const right = recipe.right[Math.floor(layer / recipe.left.length) % recipe.right.length];
      const before = entries.length;
      add(`${left}${right}`, recipe.tag);
      if (entries.length > before) grew = true;
    }
    layer++;
    if (!grew && layer > 10000) break;
  }

  function cleanUserData(value) {
    const raw = value && typeof value === 'object' ? value : {};
    const custom = Array.isArray(raw.custom) ? raw.custom.map((item, index) => ({
      id: String(item?.id || `custom-${Date.now()}-${index}`),
      text: String(item?.text || '').trim().slice(0, 80),
      tag: String(item?.tag || 'topic').trim().slice(0, 20),
      builtin: false
    })).filter(item => item.text) : [];
    const hidden = Array.isArray(raw.hidden) ? [...new Set(raw.hidden.map(String).filter(id => /^builtin-[a-f0-9]{8}$/.test(id)))].slice(0, TARGET_SIZE) : [];
    return { version: 1, custom, hidden };
  }
  function loadUserData() {
    try { return cleanUserData(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')); }
    catch (e) { console.warn('词典设置读取失败，保留内建词典', e); return cleanUserData({}); }
  }
  function saveUserData(data) {
    const clean = cleanUserData(data);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(clean)); }
    catch (e) { console.error('词典设置保存失败', e); }
    return clean;
  }
  function getAll(tag = '') {
    const data = loadUserData(), hidden = new Set(data.hidden);
    return entries.filter(item => !hidden.has(item.id) && (!tag || item.tag === tag))
      .concat(data.custom.filter(item => !tag || item.tag === tag));
  }
  function getTags() {
    const extra = loadUserData().custom.map(item => item.tag).filter(tag => !TAG_LABELS[tag]);
    return [...Object.keys(TAG_LABELS), ...new Set(extra)];
  }
  function labelFor(tag) { return TAG_LABELS[tag] || tag || '其他'; }
  function addCustom(text, tag) {
    const data = loadUserData();
    text = String(text || '').trim().slice(0, 80);
    tag = String(tag || 'topic').trim().slice(0, 20) || 'topic';
    if (!text || getAll().some(item => item.text === text && item.tag === tag)) return false;
    data.custom.push({ id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text, tag, builtin: false });
    saveUserData(data);
    return true;
  }
  function remove(id) {
    const data = loadUserData(); id = String(id || '');
    if (id.startsWith('builtin-')) { if (!data.hidden.includes(id)) data.hidden.push(id); }
    else data.custom = data.custom.filter(item => item.id !== id);
    saveUserData(data);
  }
  function restoreBuiltins() { const data = loadUserData(); data.hidden = []; saveUserData(data); }
  function exportUserData() { return loadUserData(); }
  function restoreUserData(value, merge = false) {
    const incoming = cleanUserData(value);
    if (!merge) { saveUserData(incoming); return; }
    const current = loadUserData(), customByText = new Map();
    for (const item of [...incoming.custom, ...current.custom]) customByText.set(`${item.tag}\u0000${item.text}`, item);
    saveUserData({
      version: 1,
      custom: [...customByText.values()],
      hidden: [...new Set([...incoming.hidden, ...current.hidden])]
    });
  }

  const slotOrders = [
    ['time', 'address', 'adverb', 'action', 'topic', 'particle'],
    ['reply', 'connector', 'state', 'particle', 'question'],
    ['address', 'care', 'connector', 'plan', 'particle'],
    ['time', 'place', 'sensory', 'connector', 'emotion', 'particle'],
    ['reply', 'affection', 'particle'],
    ['state', 'connector', 'action', 'topic', 'particle'],
    ['question', 'reply', 'care', 'particle']
  ];
  function randomInt(max) {
    if (typeof secureRandomInt === 'function') return secureRandomInt(max);
    return Math.floor(Math.random() * Math.max(1, max));
  }
  function parseRange(range) {
    const match = String(range || '1-4').match(/^(\d+)-(\d+)$/);
    const min = Math.max(1, Math.min(8, Number(match?.[1]) || 1));
    const max = Math.max(min, Math.min(8, Number(match?.[2]) || 4));
    return { min, max };
  }
  function generate(range = '1-4') {
    const { min, max } = parseRange(range);
    const wanted = min + randomInt(max - min + 1);
    const order = slotOrders[randomInt(slotOrders.length)];
    const chosen = [];
    for (let i = 0; i < wanted; i++) {
      const tag = order[i % order.length];
      const pool = getAll(tag);
      const fallback = pool.length ? pool : getAll();
      if (!fallback.length) break;
      let item = fallback[randomInt(fallback.length)];
      for (let retry = 0; retry < 5 && chosen.some(x => x.id === item.id); retry++) item = fallback[randomInt(fallback.length)];
      chosen.push(item);
    }
    let text = chosen.map(item => item.text).join('');
    text = text.replace(/([。！？!?]){2,}/g, '$1').replace(/([，,]){2,}/g, '$1');
    if (text && !/[。！？!?…]$/.test(text) && !chosen.some(item => item.tag === 'particle')) text += '。';
    return { text: text || '嗯。', terms: chosen.map(item => ({ id: item.id, text: item.text, tag: item.tag })) };
  }

  return {
    TARGET_SIZE, labels: TAG_LABELS, builtInCount: entries.length,
    getAll, getTags, labelFor, addCustom, remove, restoreBuiltins,
    exportUserData, restoreUserData, generate
  };
})();
