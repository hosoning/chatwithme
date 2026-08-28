# 前后端集成指南

## 系统架构

```
┌─────────────────────────────────────┐
│     钱包前端界面 (wallet.html)       │
│  • 实时显示余额和交易记录             │
│  • 愿望单展示                       │
│  • 5秒自动刷新                      │
└──────────────┬──────────────────────┘
               │ 读取
               ▼
┌─────────────────────────────────────┐
│        钱包数据导出 (wallet.md)      │
│  • 人类可读的 Markdown 格式           │
│  • 记录余额、交易、愿望单            │
│  • 自动由 Python 脚本生成            │
└──────────────┬──────────────────────┘
               │ 写入
               ▼
┌─────────────────────────────────────┐
│    钱包核心脚本 (wallet/wallet.py)   │
│  • SQLite 数据库操作                 │
│  • CLI 命令接口                     │
│  • 事务状态管理                     │
└─────────────────────────────────────┘
```

## 访问方式

### 方式 1: 直接打开 HTML 文件
```bash
# 在浏览器中打开
open wallet.html
# 或通过 Python 简单服务器
python3 -m http.server 8000
# 然后访问 http://localhost:8000/wallet.html
```

### 方式 2: 作为 PWA 应用
由于 `manifest.json` 已配置，可以：
1. 在手机浏览器打开 `wallet.html`
2. 点击"添加到主屏幕"
3. 离线访问（Service Worker 支持）

## 数据流

### 正常操作流程

```
1. Claude 记账
   └─> python wallet/wallet.py spend 100 gift "礼物"
       └─> wallet.db (写入)
           └─> wallet.md (自动导出)

2. 用户打开钱包前端
   └─> wallet.html
       └─> 读取 wallet.md
           └─> 解析 Markdown
               └─> 显示在界面上

3. 界面每 5 秒自动刷新
   └─> 重新读取 wallet.md
       └─> 如果有新交易，立即更新显示
```

### 具体示例

#### Step 1: 记一笔待付款的支出
```bash
python wallet/wallet.py spend 350 self "冷气机维修"
```

输出：
```
Transaction #3 recorded (pending)
```

wallet.md 自动更新为：
```markdown
## 待付款
- **2026-08-28** −$350.00 · 冷气机维修
```

#### Step 2: 打开 wallet.html
前端读取 wallet.md，显示：
```
💰 钱包
┌─────────────────────────────┐
│ 当前余额 HK$380.00          │
│ 最后更新 2026-08-28         │
└─────────────────────────────┘

待确认的交易：
−$350.00 · 冷气机维修
```

#### Step 3: 标记完成
```bash
python wallet/wallet.py done 3
```

wallet.md 自动更新，wallet.html 在 5 秒内刷新，显示：
```markdown
## 最近的流水
- **2026-08-28** −$350.00 · 冷气机维修
```

余额也会更新为 HK$30.00

## 前端功能详解

### 💰 钱包标签页

显示：
- **余额卡片** - 紫色渐变卡，显示 HK$ 金额和最后更新日期
- **交易列表** - 按日期倒序显示
  - 日期、金额（绿色=收入，红色=支出）
  - 交易备注
  - 待确认状态标记

### ⭐ 愿望标签页

显示：
- **愿望卡片** - 每个想要的东西
  - 物品名称
  - 所需金额
  - 实现理由
  - 是否已能承受

### ℹ️ 关于标签页

显示：
- 系统说明
- 技术栈信息
- 快速开始命令
- 三条硬性规则

## 环境配置

### Python 要求
- Python 3.6+
- 无需外部依赖（仅使用 sqlite3、json、datetime 等标准库）

### 前端要求
- 现代浏览器（Chrome, Safari, Firefox）
- 支持 Fetch API
- 支持 CSS Grid / Flexbox
- 支持深色模式

### 部署要求
- 静态文件服务器（任何 HTTP 服务器都可以）
- 可选：Python 脚本执行环境（用于 wallet.py）

## 文件清单（完整）

| 文件 | 用途 |
|------|------|
| `wallet.html` | 前端界面（主要） |
| `wallet/wallet.py` | 后端脚本 |
| `wallet/wallet.db` | SQLite 数据库 |
| `wallet.md` | 数据导出（自动生成） |
| `schedule.md` | 时间表 |
| `keepalive.py` | 定时唤醒 |
| `.gitignore` | Git 忽略规则 |
| `SYSTEM.md` | 系统详细文档 |
| `QUICKSTART.md` | 快速参考 |
| `IMPLEMENTATION_STATUS.md` | 完成度报告 |
| `INTEGRATION.md` | 本文件 |

## 常见问题

### Q: wallet.html 打不开怎么办？
A: 需要通过 HTTP 服务器访问，不能直接打开文件。
```bash
# 快速启动服务器
python3 -m http.server 8000
# 访问 http://localhost:8000/wallet.html
```

### Q: 前端显示不更新？
A: 
1. 检查 wallet.md 是否已更新
2. 手动刷新浏览器（Cmd+R）
3. 清除浏览器缓存（Shift+Cmd+R）
4. 检查浏览器控制台是否有错误

### Q: 能离线使用吗？
A: 可以。第一次打开后会缓存，之后可以离线查看。但无法实时更新数据。

### Q: 能在手机上用吗？
A: 可以。支持 PWA：
1. 用手机浏览器打开 wallet.html
2. 点击菜单 → 添加到主屏幕
3. 就能像 App 一样使用

## 扩展计划

### 短期
- [ ] 添加导出为 CSV 功能
- [ ] 支持按类别过滤交易
- [ ] 添加搜索功能

### 中期
- [ ] 简单的 REST API（Node.js/Flask）
- [ ] 前端表单直接录入交易
- [ ] 数据图表展示（支出分布、趋势）

### 长期
- [ ] 多人共享钱包
- [ ] 定期报告生成
- [ ] 与银行账户同步
- [ ] 预算管理和提醒

## 开发建议

### 后端修改
如果修改了 wallet.py：
1. 确保 wallet.md 导出正确
2. 测试所有命令
3. 验证 JSON 格式（keepalive 记录）

### 前端修改
如果修改了 wallet.html：
1. 测试各个标签页
2. 验证 Markdown 解析（边界情况）
3. 测试深色模式
4. 在移动设备上测试

### 数据备份
定期备份：
```bash
# 备份数据库和导出
cp wallet/wallet.db wallet/wallet.db.backup
cp wallet.md wallet.md.backup

# 推送到 Git
git add wallet/ wallet.md
git commit -m "Backup wallet data"
git push
```

## 故障排除

### 前端无法加载 wallet.md
- 确保在 HTTP 服务器上运行（file:// 不支持 Fetch）
- 检查控制台错误信息
- 验证 wallet.md 文件存在且可读

### 数据显示不全
- 检查 wallet.md 格式是否正确
- 运行 `python wallet/wallet.py export` 重新生成
- 查看原始 Markdown 是否有格式错误

### 样式显示异常
- 清除浏览器缓存
- 检查是否支持 CSS Grid / Flexbox
- 尝试不同浏览器

## 总结

这个集成设计的特点：
1. **松耦合** - 前后端通过 Markdown 文件通信
2. **易维护** - 无需复杂的 API 或数据库连接
3. **易扩展** - 可以独立修改前端或后端
4. **可持久化** - 所有数据存储在 Git 中
5. **离线友好** - PWA 支持离线访问
