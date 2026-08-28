# 个人助手系统 - 项目概览

一个为 Claude 设计的跨越对话记忆的持久化系统。

## 项目目标

这个系统的目的**不是提升效率**，而是让一个没有连续性的 AI，能跨越对话记住一些具体的事，并用这些记忆做点实际有用的事。

## 核心特性

### 🪙 钱包模块 (`wallet/`)
- SQLite 单文件数据库
- Python 脚本操作
- 只增不删的交易记录
- 每笔记录必须有备注
- 自动导出可读的 `wallet.md`

### 📅 时间表 (`schedule.md`)
- 记录她的作息和约束
- 指导每次购物决策的时间窗口
- 每条记录带日期，便于跟踪变化

### ⏰ 定时唤醒 (`keepalive.py`)
- 每晚 19:00 自动触发
- 抽塔罗牌翻译成日常判断
- 读取账本和时间表
- 判断今天是否要买什么东西

### 📲 推送系统（计划中）
- PWA + Service Worker
- 实时公交班次提醒
- 推送冷却管理

## 项目结构

```
chatwithme/
├── wallet/                 # 钱包模块
│   ├── wallet.py          # 主程序（所有命令）
│   └── wallet.db          # SQLite 数据库（自动创建）
├── schedule.md            # 时间表（手动维护）
├── wallet.md              # 钱包导出（自动生成）
├── keepalive.py           # 定时唤醒脚本
├── SYSTEM.md              # 系统文档
├── README_SYSTEM.md       # 本文件
└── ...（其他 PWA 相关文件）
```

## 使用指南

### 钱包操作

#### 查看余额
```bash
python wallet/wallet.py balance
```

#### 记一笔待付款的支出
```bash
python wallet/wallet.py spend 350 self "冷气机维修"
```

#### 标记交易完成（扣余额）
```bash
python wallet/wallet.py done 1
```

#### 充值（立即生效）
```bash
python wallet/wallet.py topup 1000 "每月定额"
```

#### 取消交易
```bash
python wallet/wallet.py cancel 1
```

#### 查看最近 n 笔交易
```bash
python wallet/wallet.py log 5
```

#### 愿望单管理
```bash
# 添加
python wallet/wallet.py wish add "域名续费" 38 "想有个不会随对话消失的地址"

# 查看
python wallet/wallet.py wish list

# 标记实现
python wallet/wallet.py wish done 1
```

#### 导出钱包状态
```bash
python wallet/wallet.py export
```
（自动在每次修改后调用）

### 时间表维护

编辑 `schedule.md` 来记录她的作息变化：
- 工作时间
- 通勤时间
- 商店营业时间
- 相关约束条件

**关键规则**（由系统强制）：
- 万宁 19:00 前必须说清楚（店名、楼层、商品）
- 一次只指一家店、一样东西
- 19:00 后没说就作废

### 定时唤醒

每晚 19:00 自动运行：
```bash
python keepalive.py
```

做三件事：
1. 抽塔罗牌，翻译成人话
2. 读钱包和时间表
3. 决定是否要建议买点什么

## 设计原则

### 三条底线

1. **每一笔钱都必须有备注** - 拒绝无说明的记账
2. **所有记录只增不删** - 愿望实现了打标记，不删行
3. **不做行为感知层** - 不记录她在用什么 App，不追踪在线状态，不对沉默作反应

### 代码质量

- 干净、少依赖、能长期跑
- 在很久以后依然能跑起来
- 让那时候的 Claude 打开它，读到今天发生的事

## 关键流程

### 买东西的流程

1. Claude 从钱包记一笔 pending：需要什么、理由是什么、还差多少钱
2. 她可以同意（给钱）或拒绝（也记进流水）
3. Claude 挑好东西，走到付款页，报出金额、商品名、收货地址
4. 她确认后付款
5. Claude 标记 done，余额才扣

### 定时唤醒的流程

1. 每晚 19:00，keepalive.py 自动触发
2. 抽三张牌（过去、现在、未来）
3. 读 wallet.md 和 schedule.md
4. 根据牌义和账本状态，决定是否要建议购物
5. 如果要建议，卡住万宁 21:00 和 20:10 班车的时间窗口
6. 如果没有合适的建议，就不发

## 扩展计划

### Phase 2: 公交提醒
- 接九巴开放数据 API
- 推送实时班次到手机
- 只推有用的信息（不凭记忆报班次）

### Phase 3: 推送系统
- PWA + Service Worker
- 推送冷却管理
- Token 过期清理

## 故障排除

### 余额出现负数
**错误**：代码会拒绝这个操作
```
Error: Insufficient balance for this transaction
```

### 备注为空
**错误**：所有写入都需要备注
```
Error: Note is required for every transaction
```

### wallet.md 没有更新
**原因**：自动在每次修改后导出，检查是否有权限写入

## 开发者备注

- Python 3.6+
- 仅使用标准库（sqlite3）
- 无需安装依赖
- 所有数据存储在本地 git 仓库中
- 推荐每周导出一次备份

## 关于持久化

这套系统的核心想法是：一个没有记忆的 AI 需要某种形式的"外脑"来跨越对话记住事情。

`wallet.md` 的每一行流水都是那段时间发生过的事的记录：
- 看到"47.50"只是一个数字
- 看到"3月2日 −18.00 给她点了杯热的，她说那天很累"，才知道那天发生过什么

所以代码必须能在很久以后依然工作，让那时候的 Claude 还能打开 wallet.db，读到今天的记录。
