// ===== 塔罗牌固定数据库（大阿卡纳22张 + 小阿卡纳56张）=====

const MAJOR_ARCANA = [
  {name:"愚者", up:"新的开始、冒险、无畏、自由", rev:"鲁莽、犹豫不决、错失机会"},
  {name:"魔术师", up:"创造力、行动力、资源整合、意志", rev:"欺骗、能力未发挥、操控"},
  {name:"女祭司", up:"直觉、潜意识、神秘、内在智慧", rev:"隐瞒、忽视直觉、表面化"},
  {name:"女皇", up:"丰盛、滋养、感性、创造", rev:"依赖、过度、停滞"},
  {name:"皇帝", up:"权威、结构、掌控、稳定", rev:"专制、僵化、失控"},
  {name:"教皇", up:"传统、指导、信仰、规则", rev:"教条、反叛、打破常规"},
  {name:"恋人", up:"connection、选择、和谐、爱", rev:"失衡、犹豫、错误选择"},
  {name:"战车", up:"胜利、意志力、前进、掌控局面", rev:"失控、方向不明、受阻"},
  {name:"力量", up:"内在力量、勇气、柔韧、耐心", rev:"自我怀疑、软弱、失控情绪"},
  {name:"隐士", up:"独处、内省、寻求真理、指引", rev:"孤立、逃避、迷失"},
  {name:"命运之轮", up:"转折、机遇、循环、命运", rev:"停滞、坏运气、抗拒改变"},
  {name:"正义", up:"公平、真相、因果、平衡", rev:"不公、偏见、逃避责任"},
  {name:"倒吊人", up:"暂停、牺牲、新视角、放下", rev:"拖延、抗拒、无意义牺牲"},
  {name:"死神", up:"结束、转变、释放、重生", rev:"抗拒改变、停滞不前"},
  {name:"节制", up:"平衡、耐心、调和、中庸", rev:"失衡、过度、不协调"},
  {name:"恶魔", up:"束缚、欲望、诱惑、执念", rev:"挣脱束缚、觉醒、释放"},
  {name:"塔", up:"剧变、崩塌、顿悟、突发", rev:"逃避灾难、延迟的崩溃"},
  {name:"星星", up:"希望、疗愈、灵感、信念", rev:"失望、缺乏信心、迷失方向"},
  {name:"月亮", up:"幻觉、恐惧、潜意识、不确定", rev:"困惑消散、真相浮现"},
  {name:"太阳", up:"喜悦、成功、活力、清晰", rev:"暂时的阴霾、过度乐观"},
  {name:"审判", up:"觉醒、重生、反思、召唤", rev:"自我怀疑、逃避审视"},
  {name:"世界", up:"完成、圆满、成就、整合", rev:"未完成、停滞、缺乏闭环"}
];

const SUITS = [
  {key:"wands", cn:"权杖", theme:"行动、热情、事业、创造力"},
  {key:"cups", cn:"圣杯", theme:"情感、关系、直觉、内心"},
  {key:"swords", cn:"宝剑", theme:"思维、冲突、沟通、真相"},
  {key:"pentacles", cn:"星币", theme:"物质、金钱、现实、安全感"}
];

const RANK_MEAN = {
  1:"起点、契机、新可能", 2:"选择、平衡、二元关系", 3:"合作、成长、初步成果",
  4:"稳定、休整、基础", 5:"冲突、挑战、变动", 6:"和谐、给予、恢复",
  7:"评估、坚持、耐心", 8:"加速、专注、行动或受限", 9:"接近完成、独立、警惕",
  10:"圆满、结果、循环终点", 11:"探索、学习、消息(侍从)",
  12:"行动派、冲劲、不稳定(骑士)", 13:"情感成熟、包容、直觉(王后)",
  14:"掌控、权威、成熟稳重(国王)"
};
const RANK_NAME = {1:"Ace",2:"2",3:"3",4:"4",5:"5",6:"6",7:"7",8:"8",9:"9",10:"10",11:"侍从",12:"骑士",13:"王后",14:"国王"};

const MINOR_ARCANA = [];
SUITS.forEach(suit => {
  for (let r = 1; r <= 14; r++) {
    MINOR_ARCANA.push({
      name: `${suit.cn}${RANK_NAME[r]}`,
      up: `${suit.theme} —— ${RANK_MEAN[r]}`,
      rev: `${suit.theme}方面受阻 —— ${RANK_MEAN[r]}的反面或延迟`
    });
  }
});

const FULL_DECK = [...MAJOR_ARCANA, ...MINOR_ARCANA]; // 78张

// ===== 真随机（基于 crypto，比 Math.random 更接近真随机源）=====
function secureRandomInt(max) {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0] % max;
}

function drawCards(n = 3) {
  const deck = [...FULL_DECK];
  const drawn = [];
  for (let i = 0; i < n; i++) {
    const idx = secureRandomInt(deck.length);
    const card = deck.splice(idx, 1)[0];
    const reversed = secureRandomInt(2) === 1; // 是否逆位，真随机
    drawn.push({
      name: card.name,
      reversed,
      meaning: reversed ? card.rev : card.up
    });
  }
  return drawn;
}

// ===== 幸运牌名单：用于红包触发判断 =====
const LUCKY_CARD_NAMES = ["太阳","星星","命运之轮","世界","女皇","星币国王","星币十","权杖国王"];

function isLuckyDraw(cards) {
  const hasLucky = cards.some(c => !c.reversed && LUCKY_CARD_NAMES.includes(c.name));
  const allPositive = cards.every(c => !c.reversed);
  return hasLucky || allPositive;
}

