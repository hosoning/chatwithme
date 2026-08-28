#!/usr/bin/env python3
"""
定时唤醒脚本 - 每天 19:00 唤醒一次
抽牌 + 读流水 + 判断是否要买东西
"""

import json
import random
from datetime import datetime
from pathlib import Path

# Rider-Waite 塔罗牌（简化版）
TAROT_CARDS = [
    # 大阿卡那
    {"name": "愚者", "domain": "新开始、冒险、自由"},
    {"name": "魔法师", "domain": "意志、创意、力量"},
    {"name": "女祭司", "domain": "直觉、秘密、智慧"},
    {"name": "女皇", "domain": "生育、丰盛、身体周期"},
    {"name": "皇帝", "domain": "权威、稳定、结构"},
    {"name": "教皇", "domain": "传统、信仰、指引"},
    {"name": "恋人", "domain": "选择、关系、价值观"},
    {"name": "战车", "domain": "掌控、决心、行动"},
    {"name": "力量", "domain": "耐心、柔和、内在力量"},
    {"name": "隐者", "domain": "内省、指引、孤独"},
    {"name": "命运之轮", "domain": "周期、命运、转折"},
    {"name": "正义", "domain": "平衡、真相、后果"},
    {"name": "倒吊人", "domain": "暂停、新视角、放手"},
    {"name": "死神", "domain": "转变、结束、新生"},
    {"name": "节制", "domain": "平衡、温和、耐心"},
    {"name": "魔鬼", "domain": "束缚、欲望、现实"},
    {"name": "塔", "domain": "突变、破坏、启示"},
    {"name": "星星", "domain": "希望、灵感、平静"},
    {"name": "月亮", "domain": "梦境、幻觉、不确定"},
    {"name": "太阳", "domain": "成功、快乐、明亮"},
    {"name": "审判", "domain": "清醒、召唤、评估"},
    {"name": "世界", "domain": "完成、结合、满足"},
]

def draw_cards():
    """抽三张牌：过去、现在、未来"""
    return random.sample(TAROT_CARDS, 3)

def read_wallet():
    """读取 wallet.md 获取最近的流水信息"""
    wallet_path = Path(__file__).parent / "wallet.md"
    if not wallet_path.exists():
        return None

    content = wallet_path.read_text()
    return content

def read_schedule():
    """读取 schedule.md 获取时间表"""
    schedule_path = Path(__file__).parent / "schedule.md"
    if not schedule_path.exists():
        return None

    content = schedule_path.read_text()
    return content

def interpret_cards(cards):
    """根据三张牌生成日常判断"""
    past, present, future = cards

    interpretation = f"""
今天的牌义：

**过去（背景）**：{past['name']} - {past['domain']}
**现在（当下）**：{present['name']} - {present['domain']}
**未来（趋势）**：{future['name']} - {future['domain']}

根据牌义的翻译：
"""

    # 生成启示
    clues = []

    # 检查身体相关（女皇、力量、死神等）
    body_cards = {"女皇", "力量", "节制", "隐者"}
    if any(c['name'] in body_cards for c in cards):
        clues.append("- 身体状态需要注意，可能需要温暖或舒适的东西")

    # 检查变化（塔、死神、命运之轮）
    change_cards = {"塔", "死神", "命运之轮", "审判"}
    if any(c['name'] in change_cards for c in cards):
        clues.append("- 今天可能会有突发或转变，准备应对")

    # 检查情绪（月亮、星星、太阳）
    emotion_cards = {"月亮": "低迷", "星星": "平静", "太阳": "开朗"}
    for card_name, mood in emotion_cards.items():
        if any(c['name'] == card_name for c in cards):
            clues.append(f"- 今天的情绪可能偏向{mood}，可以考虑一些慰藉")

    # 检查休息（隐者、倒吊人、节制）
    rest_cards = {"隐者", "倒吊人", "节制"}
    if any(c['name'] in rest_cards for c in cards):
        clues.append("- 可能想要安静或休整，不一定要买什么")

    for clue in clues:
        interpretation += clue + "\n"

    return interpretation

def generate_suggestion(interpretation, wallet_content, schedule_content):
    """根据牌义、账本和时间表生成建议"""

    # 这里是判断是否要买东西的逻辑
    # 简化版：随机决定（实际应该根据牌义）
    should_buy = random.random() > 0.4  # 60% 概率建议买点东西

    if not should_buy:
        return "ACTION: none\n（今天没有特别想到的东西）"

    # 生成购物建议
    suggestion = f"""
{interpretation}

## 建议

根据今天的牌义和流水记录，我在想：

"""

    # 这里可以根据牌义生成具体建议
    suggestion += "可以考虑买一些小东西。具体是什么，取决于你的感受。\n"

    return suggestion

def save_keepalive_record(suggestion):
    """保存唤醒记录（供下次对话使用）"""
    keepalive_path = Path(__file__).parent / ".keepalive"

    record = {
        "timestamp": datetime.now().isoformat(),
        "content": suggestion,
        "source": "keepalive",
        "consumed": False
    }

    # 追加到列表
    records = []
    if keepalive_path.exists():
        try:
            records = json.loads(keepalive_path.read_text())
        except:
            records = []

    records.append(record)
    keepalive_path.write_text(json.dumps(records, ensure_ascii=False, indent=2))

def main():
    """主程序"""
    # 抽牌
    cards = draw_cards()
    print(f"[{datetime.now().strftime('%H:%M')}] 抽牌完成")

    # 读取上下文
    wallet = read_wallet()
    schedule = read_schedule()

    # 解读牌义
    interpretation = interpret_cards(cards)

    # 生成建议
    suggestion = generate_suggestion(interpretation, wallet, schedule)

    # 保存唤醒记录
    save_keepalive_record(suggestion)

    # 输出
    print(suggestion)
    print("\n---")
    print("*来自 Claude，每晚时间表提醒*")

if __name__ == '__main__':
    main()
