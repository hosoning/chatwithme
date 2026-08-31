# 个人助理系统（钱包 / 日程 / 塔罗）

这是在 `hosoning/chatwithme` 仓库、`claude/personal-assistant-system-e56vym` 分支上独立运作的系统，与仓库里原本的仿微信 PWA（chatwithme 本体，李泽言对话用）完全无关、互不干扰。三个模块：钱包、日程、塔罗牌。

## 钱包

- CLI：`wallet/wallet.py`（纯标准库，无外部依赖），数据存 `wallet/wallet.db`（SQLite）
- 每次操作后自动导出到根目录 `wallet.md`
- 前端：根目录 `wallet.html`，读取 `wallet.md` 显示（有 cache-busting）
- 硬性规则：
  - 每笔交易必须有备注，不能为空
  - 余额不能变负数
  - 不可删除记录，只能 pending → done / cancelled
  - 买实体商品：告诉用户地址、收件人、合法性
  - 买虚拟服务：只需确认合法性
- 零花钱：用户会不定期给 Claude ¥50-200（每 1-3 个月一次），Claude 自行按规则管理

### Telegram 通知桥接（已部署、可用）

因为 Claude 所在的云端环境无法直连 Telegram API（403），采用桥接架构：

```
Claude / GitHub Actions → Supabase Edge Function (wallet-telegram-bridge) → Telegram Bot API
```

- Supabase 项目：`cwnhwbubbswcjizcwwsl`
- Edge Function：`supabase/functions/wallet-telegram-bridge/index.ts`
  - 已部署，Verify JWT = OFF
  - GET 请求会自动调用 Telegram `setWebhook`（不需要在本地跑 curl）
  - 支持的 Telegram 命令：`/start` `/status` `/balance`，其他文字存进 `wallet_feedback` 表
- Schema：`supabase/wallet_bridge_schema.sql`（`wallet_feedback` / `wallet_progress` 两张表，仅 service_role 可读写）
- GitHub Actions：`.github/workflows/wallet-telegram-notify.yml`，定时/手动触发时把 milestone 通知推给 Telegram（需要 `SUPABASE_WALLET_TELEGRAM_BRIDGE_URL`、`CLAUDE_WALLET_PROGRESS_SECRET` 两个 GitHub Secrets，**还没加**）
- 通知原则：只在人类会觉得舒服的频率通知（重大决定、大额消费、milestone），不要每笔都推送，保留一点惊喜感

### 说明文档

`docs/telegram-bridge-setup.md` 有完整的部署步骤记录。

## 日程

`schedule.md` — 纯 markdown 记录，人工/对话中更新，暂无自动化。

## 塔罗

`js/tarot.js` — 塔罗牌数据（78 张）。抽牌是 Claude 在对话中主动、随机时间进行的，不是固定排程；抽到会告诉用户。

## 尚未完成

- [ ] 加 GitHub Secrets：`SUPABASE_WALLET_TELEGRAM_BRIDGE_URL`、`CLAUDE_WALLET_PROGRESS_SECRET`
- [ ] 决定 GitHub Actions 的 schedule 触发是否要留着（用户可能会关掉，保持手动触发也可以）

## 沟通习惯（重要）

- 用户要求：只回答被问到的问题，不要展开、不要主动给一大串步骤
- 用户不在意后台技术细节，只要能用、结果清楚即可
- 不要在本机（这是共享电脑，非用户私人电脑）留下任何文件或凭据；所有部署操作走云端（Supabase / GitHub Actions），需要人操作的步骤要讲清楚"在哪里点、点什么"
- 凭据（token、service role key）用后不留存、不上传
