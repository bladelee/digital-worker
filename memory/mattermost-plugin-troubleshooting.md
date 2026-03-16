# OpenClaw Mattermost 插件故障排查指南

## 问题背景

在配置 OpenClaw Mattermost 插件时，遇到了插件加载失败的问题。本文档记录了完整的排查过程和解决方案。

## 现象

执行 `openclaw channels capabilities` 时，Mattermost 插件报错：

```
[plugins] mattermost failed to load from /root/.local/share/pnpm/global/5/.pnpm/openclaw@2026.3.7_xxx/node_modules/openclaw/extensions/mattermost/index.ts: 
Error: Cannot find module '../../../../src/infra/parse-finite-number.js'
```

## 根本原因

### 1. 版本不匹配

OpenClaw 使用 **pnpm** 进行包管理，pnpm 的目录结构如下：

```
/root/.local/share/pnpm/global/5/
├── node_modules/
│   └── openclaw -> ../.pnpm/openclaw@2026.3.8_xxx/node_modules/openclaw  (符号链接)
└── .pnpm/
    ├── openclaw@2026.3.7_xxx/  (旧版本，未删除)
    └── openclaw@2026.3.8_xxx/  (新版本)
```

当运行 `pnpm update -g openclaw` 时：
- 新版本被安装到 `.pnpm/openclaw@2026.3.8_xxx/`
- 符号链接 `node_modules/openclaw` 被更新指向新版本
- **但旧版本目录 `.pnpm/openclaw@2026.3.7_xxx/` 不会自动删除**

### 2. systemd 服务硬编码路径

OpenClaw 的 systemd 服务文件在安装时生成，**硬编码了当时的版本路径**：

```ini
# ~/.config/systemd/user/openclaw-gateway.service
[Service]
ExecStart=/root/.nvm/versions/node/v22.22.1/bin/node /root/.local/share/pnpm/global/5/.pnpm/openclaw@2026.3.7_xxx/node_modules/openclaw/dist/index.js gateway --port 18789
```

这意味着即使 pnpm 更新了版本，systemd 服务仍然运行旧版本。

### 3. OpenClaw 2026.3.7 的 Bug

2026.3.7 版本的 Mattermost 插件有代码缺陷，引用了不存在的源码路径：

```typescript
// extensions/mattermost/src/mattermost/monitor.ts (2026.3.7)
import { parseStrictPositiveInteger } from "../../../../src/infra/parse-finite-number.js";
```

在打包发布时，`src/` 目录不存在（只有 `dist/`），导致模块加载失败。

2026.3.8 修复了这个问题，改用正确的导入路径：

```typescript
// extensions/mattermost/src/mattermost/monitor.ts (2026.3.8)
import { parseStrictPositiveInteger } from "openclaw/plugin-sdk/mattermost";
```

## 排查步骤

### 1. 确认当前运行版本

```bash
# 查看 gateway 服务状态
openclaw gateway status

# 查看服务文件内容
cat ~/.config/systemd/user/openclaw-gateway.service
```

### 2. 检查 pnpm 安装的版本

```bash
# 查看全局安装的 openclaw 版本
pnpm list -g openclaw

# 查看 pnpm 存储的所有版本
ls /root/.local/share/pnpm/global/5/.pnpm/ | grep openclaw
```

### 3. 检查日志

```bash
# 查看 gateway 日志
tail -100 /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log | grep -i mattermost

# 成功连接的日志应该显示：
# "mattermost connected as @xxx"
```

### 4. 验证插件代码差异

```bash
# 检查旧版本的导入问题
grep -r "parse-finite-number" /root/.local/share/pnpm/global/5/.pnpm/openclaw@2026.3.7*/node_modules/openclaw/extensions/mattermost/

# 检查新版本是否修复
grep -r "parse-finite-number" /root/.local/share/pnpm/global/5/.pnpm/openclaw@2026.3.8*/node_modules/openclaw/extensions/mattermost/
```

## 解决方案

### 手动更新 systemd 服务

1. **更新服务文件中的版本号**：

```bash
# 编辑服务文件
vim ~/.config/systemd/user/openclaw-gateway.service

# 替换所有 2026.3.7 为 2026.3.8
# 主要修改：
# - Description=OpenClaw Gateway (v2026.3.8)
# - ExecStart=...openclaw@2026.3.8_xxx/...
# - Environment=OPENCLAW_SERVICE_VERSION=2026.3.8
```

2. **重新加载并重启服务**：

```bash
systemctl --user daemon-reload
systemctl --user restart openclaw-gateway
```

### 或者：重新生成服务文件

```bash
# 停止并禁用旧服务
systemctl --user stop openclaw-gateway
systemctl --user disable openclaw-gateway

# 删除旧服务文件
rm ~/.config/systemd/user/openclaw-gateway.service

# 重新生成服务
openclaw gateway install
```

## 关键经验总结

### 1. pnpm 版本管理

pnpm 更新包后，旧版本目录不会自动清理。多个版本可以共存，但需要确保服务指向正确版本。

### 2. systemd 服务路径

OpenClaw 的 systemd 服务文件在安装时生成，**不会自动跟随包更新**。每次更新 OpenClaw 后需要：

```bash
systemctl --user daemon-reload
systemctl --user restart openclaw-gateway
# 或手动更新服务文件
```

### 3. 区分 Gateway 和 CLI 的版本

- **Gateway**：由 systemd 管理，独立进程，使用服务文件指定的版本
- **CLI**：使用当前 shell 环境的 pnpm 符号链接指向的版本

两者可能不同！Gateway 的版本以 `openclaw gateway status` 显示为准。

### 4. 日志是关键

不要只看 CLI 输出的错误，Gateway 日志才是真实状态：

```bash
# Gateway 日志路径
/tmp/openclaw/openclaw-$(date +%Y-%m-%d).log

# 成功连接的关键日志
grep "mattermost connected" /tmp/openclaw/openclaw-*.log
```

### 5. 版本兼容性

遇到插件加载错误时，首先检查：
1. OpenClaw 主程序版本
2. 插件是否与主程序版本匹配
3. 是否存在已知的 bug（查看 CHANGELOG）

## 配置文件位置参考

```
~/.openclaw/
├── openclaw.json              # 主配置文件（包含 channels 配置）
├── extensions/                 # 本地安装的插件
└── agents/main/sessions/       # 会话缓存

~/.config/systemd/user/
└── openclaw-gateway.service    # systemd 服务文件

/tmp/openclaw/
└── openclaw-YYYY-MM-DD.log     # Gateway 日志
```

## Mattermost 配置示例

```json
// ~/.openclaw/openclaw.json
{
  "channels": {
    "mattermost": {
      "enabled": true,
      "baseUrl": "http://127.0.0.1:8065",
      "botToken": "your-bot-token-here"
    }
  }
}
```

## 验证连接成功

1. **检查日志**：
   ```bash
   grep "mattermost connected" /tmp/openclaw/openclaw-*.log
   ```

2. **在 Mattermost 中测试**：
   - 给机器人用户（如 @tokyocatbot）发送消息
   - 机器人应该能正常响应

---

## 附录 D：Mattermost 插件安装与配置完整流程

### 前置条件

1. 一个自建的 Mattermost 服务（如 `http://127.0.0.1:8065`）
2. Mattermost 管理员权限（用于创建 Bot Token）

### 步骤 1：在 Mattermost 中创建 Bot 账户

1. **登录 Mattermost 管理员账户**

2. **进入 System Console**
   - 点击左上角用户头像
   - 选择 "System Console"

3. **创建 Bot**
   - 左侧菜单：Integrations → Bot Accounts
   - 点击 "Add Bot Account"
   - 填写信息：
     - **Username**: `tokyocatbot`（或你喜欢的名字）
     - **Display Name**: `Tokyo Cat Bot`
     - **Description**: `OpenClaw AI Assistant`
   - 勾选权限：
     - `post:channels` - 可以发消息到频道
     - `post:direct` - 可以发私信
     - `read:channels` - 可以读取频道消息
   - 点击 "Create Bot Account"

4. **生成 Token**
   - 创建成功后，点击 "Create Token"
   - 复制生成的 Token（类似 `tuqjxr4o63gwinbabgqwffsida`）
   - **重要**：Token 只显示一次，务必保存！

5. **将 Bot 加入团队和频道**
   - 回到主界面
   - 在频道中输入 `/invite @tokyocatbot`
   - 或在团队设置中添加 Bot 为成员

### 步骤 2：安装 OpenClaw Mattermost 插件

OpenClaw 2026.3.7+ 版本已内置 Mattermost 插件，无需单独安装。

如果插件未加载，检查：
```bash
# 确认 OpenClaw 版本
openclaw --version

# 确认插件文件存在
ls /root/.local/share/pnpm/global/5/node_modules/openclaw/extensions/mattermost/
```

### 步骤 3：配置 OpenClaw 连接 Mattermost

**方法 A：通过命令行配置**

```bash
openclaw channels add --channel mattermost \
  --token tuqjxr4o63gwinbabgqwffsida \
  --url http://127.0.0.1:8065
```

**方法 B：直接编辑配置文件**

编辑 `~/.openclaw/openclaw.json`：

```json
{
  "channels": {
    "mattermost": {
      "enabled": true,
      "baseUrl": "http://127.0.0.1:8065",
      "botToken": "tuqjxr4o63gwinbabgqwffsida"
    }
  }
}
```

### 步骤 4：重启 Gateway 使配置生效

```bash
systemctl --user restart openclaw-gateway
```

### 步骤 5：验证连接

1. **检查日志**
   ```bash
   tail -50 /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log | grep mattermost
   ```

   成功的日志：
   ```
   [default] starting channel
   mattermost connected as @tokyocatbot
   ```

2. **在 Mattermost 中测试**
   - 给 Bot 发私信，或
   - 在频道中 @机器人
   - Bot 应该能正常响应

### 配置参数说明

| 参数 | 必填 | 说明 |
|------|------|------|
| `enabled` | 是 | 是否启用该渠道 |
| `baseUrl` | 是 | Mattermost 服务地址 |
| `botToken` | 是 | Bot 账户的访问令牌 |

### 高级配置（可选）

```json
{
  "channels": {
    "mattermost": {
      "enabled": true,
      "baseUrl": "http://127.0.0.1:8065",
      "botToken": "tuqjxr4o63gwinbabgqwffsida",
      "actions": {
        "reactions": true
      },
      "groupPolicy": "open",
      "groupRequireMention": true
    }
  }
}
```

| 参数 | 说明 |
|------|------|
| `actions.reactions` | 是否启用表情回复功能 |
| `groupPolicy` | 群组消息策略：`open`（响应所有）/ `mention`（仅响应@消息） |
| `groupRequireMention` | 群组中是否必须@才响应 |

### 常见问题

#### Q1: Bot Token 无效

```
Error: Invalid or expired token
```

解决：
1. 确认 Token 复制完整
2. 在 Mattermost 中重新生成 Token
3. 更新配置文件中的 Token

#### Q2: Bot 无法接收消息

检查：
1. Bot 是否已加入团队
2. Bot 是否已加入目标频道（或频道是公开的）
3. Bot 权限是否正确设置

#### Q3: Gateway 连接失败

```
Error: connect ECONNREFUSED
```

检查：
1. Mattermost 服务是否运行：`curl http://127.0.0.1:8065/api/v4/system/ping`
2. baseUrl 是否正确（注意端口号）
3. 网络是否可达

### 架构图

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│   Mattermost    │  HTTP   │  OpenClaw       │         │   AI Model      │
│   Server        │◄───────►│  Gateway        │◄───────►│   (GLM-5, etc)  │
│   :8065         │  WS     │   :18789        │         │                 │
└─────────────────┘         └─────────────────┘         └─────────────────┘
        ▲                           │
        │                           │
        ▼                           ▼
┌─────────────────┐         ┌─────────────────┐
│   Bot Token     │         │  ~/.openclaw/   │
│   @tokyocatbot  │         │  openclaw.json  │
└─────────────────┘         └─────────────────┘
```

**工作流程**：
1. 用户在 Mattermost 发消息给 Bot
2. Mattermost 通过 WebSocket 推送消息到 OpenClaw Gateway
3. Gateway 调用 AI 模型生成回复
4. Gateway 通过 HTTP API 将回复发送到 Mattermost

---

## 附录 A：如何查看本文档

本文档保存在 OpenClaw workspace 目录下：

```bash
# 直接查看
cat ~/.openclaw/workspace/memory/mattermost-plugin-troubleshooting.md

# 或用编辑器打开
vim ~/.openclaw/workspace/memory/mattermost-plugin-troubleshooting.md
code ~/.openclaw/workspace/memory/mattermost-plugin-troubleshooting.md
```

也可以让 AI 助手直接读取并解释：
> "请读取 memory/mattermost-plugin-troubleshooting.md 并解释"

---

## 附录 B：版本更新原理详解

### 为什么和 systemd 有关系？

OpenClaw Gateway 是一个**长期运行的后台服务**，负责：
- 监听各渠道（Feishu、Mattermost、QQ 等）的消息
- 将消息转发给 AI 处理
- 将 AI 回复发送回渠道

在 Linux 上，长期运行的服务通常由 **systemd** 管理。当你运行 `openclaw gateway install` 时，它会：

1. 生成一个 systemd 服务文件（`~/.config/systemd/user/openclaw-gateway.service`）
2. 服务文件里写死了启动命令的**完整路径**
3. systemd 根据这个文件启动并守护进程

**问题在于**：服务文件里的路径是安装时的版本，比如：
```
/root/.local/share/pnpm/global/5/.pnpm/openclaw@2026.3.7_xxx/node_modules/openclaw/dist/index.js
```

当你更新 OpenClaw 后，新版本安装到了新路径：
```
/root/.local/share/pnpm/global/5/.pnpm/openclaw@2026.3.8_xxx/node_modules/openclaw/dist/index.js
```

但 systemd **不知道**你更新了，它仍然运行旧路径下的代码！

### pnpm 的版本管理机制

pnpm 使用**内容寻址存储**：

```
~/.local/share/pnpm/global/5/
├── node_modules/
│   └── openclaw -> ../.pnpm/openclaw@2026.3.8_xxx/node_modules/openclaw
└── .pnpm/
    ├── openclaw@2026.3.7_xxx/    # 旧版本（还在）
    └── openclaw@2026.3.8_xxx/    # 新版本
```

当你运行 `pnpm update -g openclaw`：
1. 下载新版本到 `.pnpm/openclaw@新版本/`
2. 更新 `node_modules/openclaw` 符号链接指向新版本
3. **旧版本目录不会删除**（这是 pnpm 的设计，支持快速回滚）

所以：
- 新开的 shell 运行 `openclaw` 命令 → 用新版本（通过符号链接）
- systemd 服务 → 用旧版本（因为服务文件写死了路径）

### 更新流程对比

#### ❌ 错误的更新流程

```bash
pnpm update -g openclaw
systemctl --user restart openclaw-gateway  # 重启无效，还是旧路径！
```

#### ✅ 正确的更新流程（方法一：手动修改）

```bash
# 1. 更新包
pnpm update -g openclaw

# 2. 查看新版本路径
ls ~/.local/share/pnpm/global/5/.pnpm/ | grep openclaw

# 3. 修改服务文件
vim ~/.config/systemd/user/openclaw-gateway.service
# 把旧版本号替换为新版本号

# 4. 重新加载并重启
systemctl --user daemon-reload
systemctl --user restart openclaw-gateway

# 5. 验证
openclaw gateway status | grep openclaw@
```

#### ✅ 正确的更新流程（方法二：重新安装服务）

```bash
# 1. 更新包
pnpm update -g openclaw

# 2. 停止并删除旧服务
systemctl --user stop openclaw-gateway
rm ~/.config/systemd/user/openclaw-gateway.service

# 3. 重新生成服务（会用当前版本路径）
openclaw gateway install

# 4. 启动
systemctl --user start openclaw-gateway
```

### 更好的版本升级流程建议

目前 OpenClaw 没有自动处理这个问题。建议的改进：

**方案 1：使用符号链接路径**

服务文件不写死版本号，而是用：
```
/root/.local/share/pnpm/global/5/node_modules/openclaw/dist/index.js
```
这样更新后自动指向新版本。

**方案 2：提供升级命令**

OpenClaw 可以增加 `openclaw upgrade` 命令，自动：
1. 更新 pnpm 包
2. 更新 systemd 服务文件
3. 重启服务

**方案 3：用户层面的最佳实践**

把更新流程写成脚本：

```bash
#!/bin/bash
# ~/upgrade-openclaw.sh

set -e

echo "Updating OpenClaw..."
pnpm update -g openclaw

echo "Getting new version..."
NEW_VERSION=$(pnpm list -g openclaw --json | jq -r '.[0].version')
echo "New version: $NEW_VERSION"

echo "Updating systemd service..."
systemctl --user stop openclaw-gateway
rm -f ~/.config/systemd/user/openclaw-gateway.service
openclaw gateway install
systemctl --user daemon-reload
systemctl --user start openclaw-gateway

echo "Verifying..."
openclaw gateway status

echo "Done!"
```

---

## 附录 C：我这次更新的具体过程

### 步骤 1：发现问题
运行 `openclaw channels capabilities` 看到 Mattermost 插件加载失败，错误信息指向 `2026.3.7` 路径。

### 步骤 2：确认版本不匹配
```bash
openclaw gateway status
# 显示：openclaw@2026.3.7_xxx

pnpm list -g openclaw
# 显示：2026.3.8
```

发现 Gateway 运行的是旧版本，但 pnpm 已安装新版本。

### 步骤 3：检查服务文件
```bash
cat ~/.config/systemd/user/openclaw-gateway.service
```

确认服务文件硬编码了 `2026.3.7` 路径。

### 步骤 4：更新服务文件
我用 `edit` 工具修改了服务文件，把所有 `2026.3.7` 替换为 `2026.3.8`：
- Description 行
- ExecStart 行（路径）
- Environment=OPENCLAW_SERVICE_VERSION 行

### 步骤 5：通知用户重启
因为我在当前会话中执行 `systemctl restart` 会导致自己被终止，所以让你手动执行：
```bash
systemctl --user daemon-reload
systemctl --user restart openclaw-gateway
```

### 步骤 6：验证
```bash
openclaw gateway status
# 显示：openclaw@2026.3.8_xxx ✓

grep "mattermost connected" /tmp/openclaw/openclaw-*.log
# 显示：mattermost connected as @tokyocatbot ✓
```

---

*文档创建时间：2026-03-10*
*问题版本：OpenClaw 2026.3.7*
*解决版本：OpenClaw 2026.3.8*
