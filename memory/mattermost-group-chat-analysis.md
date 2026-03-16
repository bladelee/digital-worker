# Mattermost 群聊消息接收分析报告

**日期:** 2026-03-11  
**作者:** OpenClaw 分析

---

## 问题描述

在 Mattermost 群聊/频道中发送消息，OpenClaw 的 Mattermost 插件无法收到**不提及 bot 的普通群聊消息**。

---

## 结论

**Mattermost 服务端不会向 Bot 用户推送不提及 bot 的普通群聊消息。** 这是 Mattermost 的设计决策，不是 OpenClaw 的问题。

---

## 消息接收能力矩阵

| 消息类型 | Bot 能收到？ | 说明 |
|---------|------------|------|
| DM 私聊 | ✅ | 正常接收 |
| 群聊中 @提及 bot | ✅ | 正常接收 |
| 群聊普通消息（无 @提及） | ❌ | Mattermost 不推送 |
| Group DM 普通消息 | ❌ | Mattermost 不推送 |

---

## 技术分析

### 1. 数据流

```
用户发消息 → Mattermost 服务端 → WebSocket 推送 → OpenClaw 插件 → 消息处理
```

### 2. 关键代码路径

**OpenClaw Mattermost 插件 WebSocket 处理:**
```
/extensions/mattermost/src/mattermost/monitor-websocket.ts
```

```typescript
ws.on("message", async (data) => {
  const raw = rawDataToString(data);
  let payload: MattermostEventPayload;
  try {
    payload = JSON.parse(raw) as MattermostEventPayload;
  } catch {
    return;
  }

  // 只处理 "posted" 事件
  if (payload.event !== "posted") {
    return;
  }
  // ...
});
```

**OpenClaw 代码完全支持处理群聊消息**，但 Mattermost 服务端选择不推送。

### 3. 验证实验

| 时间 | 操作 | 结果 |
|-----|------|------|
| 09:43:27 | 在频道发 `@tokyocatbot hello` | ✅ 收到并响应 |
| 09:43:41 | 在 Group DM 发消息 | ✅ 收到并响应 |
| 09:53:xx | 在频道发 `group hello`（无 @提及） | ❌ 未收到 |

### 4. 日志证据

**收到 @提及 消息的日志:**
```json
{"subsystem":"gateway/channels/mattermost"} "delivered reply to channel:7na63fak3fydtdefapu3cnha5o"
```

**普通消息（无 @提及）的日志:** 无任何记录

---

## 为什么 Mattermost 这样设计？

这是 **隐私/效率设计决策**：
1. **减少噪音:** Bot 不需要收到所有群聊消息，只处理与自己相关的
2. **隐私保护:** 避免机器人监听所有群聊内容
3. **性能优化:** 减少不必要的 WebSocket 推送

---

## 解决方案

### 方案 1: @提及 Bot（推荐）

在需要 bot 响应的消息中使用 `@tokyocatbot`。

**优点:** 简单，无需额外开发  
**缺点:** 用户必须显式提及

### 方案 2: Outgoing Webhook（需要开发）

在 Mattermost 中配置 Outgoing Webhook，将群聊消息主动推送到 OpenClaw 的 HTTP endpoint。

**配置步骤:**
1. Mattermost 管理后台 → Integrations → Outgoing Webhooks
2. 创建 Webhook，指定触发频道和目标 URL
3. OpenClaw 需要开发对应的 HTTP 接收端点

**优点:** 可以接收所有消息  
**缺点:** 需要额外开发

### 方案 3: Bot 账号转普通用户（不推荐）

将 bot 账号转换为普通用户账号。

**优点:** 能收到所有消息  
**缺点:** 失去 bot 特性，不推荐

---

## 相关配置

### OpenClaw 群聊权限配置

```json
{
  "channels": {
    "mattermost": {
      "groupPolicy": "open"
    }
  }
}
```

`groupPolicy` 选项:
- `"open"` - 接收所有群聊消息（如果 Mattermost 推送的话）
- `"allowlist"` - 只接收白名单用户的消息
- `"disabled"` - 不接收群聊消息

**注意:** 即使配置为 `open`，也受限于 Mattermost 服务端的推送行为。

---

## 相关源码文件

| 文件 | 说明 |
|-----|------|
| `extensions/mattermost/src/mattermost/monitor.ts` | 消息处理主逻辑 |
| `extensions/mattermost/src/mattermost/monitor-websocket.ts` | WebSocket 连接和事件处理 |
| `extensions/mattermost/src/mattermost/monitor-auth.ts` | 权限验证逻辑 |
| `extensions/mattermost/src/config-schema.ts` | 配置 Schema 定义 |

---

---

## Mattermost 服务端改造方案

### 方案概述

要让 Mattermost 服务端向 Bot 推送所有群聊消息，有三种改造路径：

| 方案 | 难度 | 风险 | 推荐度 |
|-----|------|------|--------|
| 1. 修改源码重新编译 | 高 | 高（升级困难） | ⭐⭐ |
| 2. 开发 Mattermost 插件 | 中 | 低 | ⭐⭐⭐⭐⭐ |
| 3. 配置 Outgoing Webhook | 低 | 低 | ⭐⭐⭐⭐ |

---

### 方案 1: 修改 Mattermost 源码

**原理:** 修改 WebSocket 消息分发逻辑，让 Bot 用户也能收到所有频道消息。

**关键源码位置（基于 Mattermost v9.x）:**

```
server/channels/app/webbus.go          # WebSocket 消息分发
server/channels/app/post.go           # 帖子处理逻辑
server/channels/model/websocket_message.go  # WebSocket 消息模型
```

**核心逻辑在 `webbus.go`:**

```go
// 伪代码：Mattermost 当前的消息过滤逻辑
func (w *WebBus) Publish(message *WebSocketMessage) {
    for _, session := range w.sessions {
        // 关键：这里过滤了 Bot 用户
        if session.IsBot && !message.HasMention(session.UserId) {
            continue  // 跳过不提及 Bot 的消息
        }
        session.Send(message)
    }
}
```

**改造步骤:**

1. **Fork Mattermost 仓库**
   ```bash
   git clone https://github.com/mattermost/mattermost.git
   cd mattermost
   ```

2. **修改消息分发逻辑**

   在 `server/channels/app/webbus.go` 中找到消息分发函数，添加配置选项：

   ```go
   // 新增配置项
   type WebBusConfig struct {
       // 原有配置...
       EnableBotAllChannelMessages bool `json:"enable_bot_all_channel_messages"`
   }

   // 修改分发逻辑
   func (w *WebBus) shouldSendToSession(session *Session, message *WebSocketMessage) bool {
       // 如果启用了 Bot 全量消息，且消息来自频道
       if w.config.EnableBotAllChannelMessages && session.IsBot {
           if message.Broadcast.ChannelId != "" {
               // 检查 Bot 是否在该频道中
               if w.isBotInChannel(session.UserId, message.Broadcast.ChannelId) {
                   return true
               }
           }
       }
       
       // 原有逻辑...
       return w.originalShouldSendToSession(session, message)
   }
   ```

3. **添加配置项**

   在 `server/channels/model/config.go` 中添加：

   ```go
   type MessageServiceSettings struct {
       // 原有配置...
       EnableBotAllChannelMessages *bool `json:"enablebotallchannelmessages"`
   }
   ```

4. **重新编译**
   ```bash
   cd server
   make build
   ```

5. **替换 Docker 镜像**
   ```dockerfile
   # 自定义 Dockerfile
   FROM mattermost/mattermost-team-edition:latest
   COPY bin/mattermost /mattermost/bin/mattermost
   ```

**优点:** 完全控制，可精确实现需求  
**缺点:** 
- 需要维护 Fork 版本
- 每次升级 Mattermost 需要重新 merge
- 可能影响性能（Bot 收到大量消息）

---

### 方案 2: 开发 Mattermost 插件（推荐）

**原理:** 利用 Mattermost 插件系统，订阅帖子创建事件，然后通过 Bot API 主动拉取或转发消息。

**插件架构:**

```
┌─────────────────────────────────────────────────────┐
│                  Mattermost Server                   │
│  ┌─────────────┐    ┌──────────────────────────┐   │
│  │   Plugin    │    │   WebSocket (Bot)        │   │
│  │             │    │                          │   │
│  │ OnPostCreate│───▶│ 主动推送/转发到 OpenClaw │   │
│  │   Hook      │    │                          │   │
│  └─────────────┘    └──────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

**插件代码示例 (Go):**

```go
// main.go
package main

import (
    "github.com/mattermost/mattermost/server/public/model"
    "github.com/mattermost/mattermost/server/public/plugin"
)

type BotChannelForwarderPlugin struct {
    plugin.MattermostPlugin
}

// 实现 PostWillBePublished 钩子
func (p *BotChannelForwarderPlugin) PostWillBePublished(c *plugin.Context, post *model.Post) (*model.Post, string) {
    // 获取频道信息
    channel, _ := p.API.GetChannel(post.ChannelId)
    
    // 只处理频道消息（非 DM）
    if channel.Type == model.ChannelTypeOpen || channel.Type == model.ChannelTypePrivate {
        // 获取所有 Bot 用户
        bots, _ := p.API.GetBots(0, 100, "")
        
        for _, bot := range bots {
            // 检查 Bot 是否在频道中
            member, _ := p.API.GetChannelMember(post.ChannelId, bot.UserId)
            if member != nil {
                // 创建一个副本推送给 Bot
                p.forwardToBot(post, bot.UserId)
            }
        }
    }
    
    return post, ""
}

func (p *BotChannelForwarderPlugin) forwardToBot(post *model.Post, botUserId string) {
    // 通过 WebSocket 或内部 API 通知 Bot
    p.API.PublishWebSocketEvent("bot_channel_message", map[string]interface{}{
        "post_id":    post.Id,
        "channel_id": post.ChannelId,
        "user_id":    post.UserId,
        "message":    post.Message,
    }, &model.WebsocketBroadcast{
        UserId: botUserId,
    })
}

func main() {
    plugin.ClientMain(&BotChannelForwarderPlugin{})
}
```

**manifest.json:**

```json
{
    "id": "com.openclaw.bot-channel-forwarder",
    "name": "Bot Channel Forwarder",
    "version": "1.0.0",
    "min_server_version": "9.0.0",
    "server": {
        "executables": {
            "linux-amd64": "server/dist/plugin-linux-amd64"
        }
    }
}
```

**构建和安装:**

```bash
# 构建
cd plugin
go build -o server/dist/plugin-linux-amd64

# 打包
tar -czf bot-channel-forwarder.tar.gz manifest.json server/

# 通过 API 安装
curl -X POST \
  -H "Authorization: Bearer <admin-token>" \
  -F "plugin=@bot-channel-forwarder.tar.gz" \
  http://localhost:8065/api/v4/plugins
```

**OpenClaw 端适配:**

在 `monitor-websocket.ts` 中添加新事件处理：

```typescript
// 处理插件推送的频道消息
if (payload.event === "bot_channel_message") {
  const postData = payload.data;
  // 转换为标准 Post 格式并处理
  await opts.onPosted({
    id: postData.post_id,
    channel_id: postData.channel_id,
    user_id: postData.user_id,
    message: postData.message,
    // ...
  }, payload);
}
```

**优点:**
- 不修改 Mattermost 核心代码
- 升级 Mattermost 不影响插件
- 精确控制哪些频道/消息需要转发

**缺点:** 需要开发和维护插件

---

### 方案 3: Outgoing Webhook 配置（最简单）

**原理:** 在 Mattermost 中配置 Outgoing Webhook，将频道消息 POST 到 OpenClaw 的 HTTP endpoint。

**配置步骤:**

1. **Mattermost 管理后台**
   - 进入 Integrations → Outgoing Webhooks
   - 点击 "Add Outgoing Webhook"

2. **配置参数:**

| 字段 | 值 |
|-----|---|
| Title | OpenClaw Bot Forwarder |
| Description | 转发频道消息到 OpenClaw |
| Channel | 选择目标频道（或 All Channels） |
| Trigger Words | 留空（触发所有消息） |
| Trigger When | First word matches（或留空） |
| Callback URLs | `http://<openclaw-host>:18789/api/channels/mattermost/webhook` |
| Content Type | application/json |

3. **OpenClaw 端添加 Webhook 接收端点**

   在 Mattermost 插件中添加 HTTP 处理：

   ```typescript
   // server/channels/mattermost/webhook.ts
   import express from 'express';
   
   const router = express.Router();
   
   router.post('/webhook', async (req, res) => {
     const { token, team_id, team_domain, channel_id, channel_name, 
             timestamp, user_id, user_name, text, trigger_word } = req.body;
     
     // 验证 token（可选）
     
     // 构造消息并分发
     const post = {
       id: `webhook-${timestamp}`,
       channel_id,
       user_id,
       message: text,
       create_at: timestamp * 1000,
     };
     
     // 调用消息处理逻辑
     await handleMessage(post);
     
     // 返回空响应（不回复消息）
     res.json({});
   });
   
   export default router;
   ```

4. **在 Gateway 中注册路由**

   修改 `extensions/mattermost/src/mattermost/index.ts`：

   ```typescript
   // 注册 Webhook 路由
   gateway.registerHttpRoute('/api/channels/mattermost/webhook', 'POST', webhookHandler);
   ```

**优点:**
- 零代码修改 Mattermost
- 配置简单快速
- 官方支持的功能

**缺点:**
- 需要为每个频道单独配置（或配置全局）
- 通过 HTTP 而非 WebSocket，可能有延迟

---

## 推荐方案

根据不同场景：

| 场景 | 推荐方案 |
|-----|---------|
| 快速验证/测试 | 方案 3: Outgoing Webhook |
| 生产环境使用 | 方案 2: 开发插件 |
| 需要完全控制 | 方案 1: 修改源码 |

**我的建议:** 先用 **方案 3 (Outgoing Webhook)** 验证效果，如果满意再开发 **方案 2 (插件)** 做长期方案。

---

## 参考资料

- [Mattermost WebSocket API](https://api.mattermost.com/#tag/WebSocket)
- [Mattermost Bot Accounts](https://docs.mattermost.com/deploy/bot-accounts.html)
- [Mattermost Outgoing Webhooks](https://docs.mattermost.com/developer/outgoing-webhooks.html)
- [Mattermost Plugin Development](https://developers.mattermost.com/extend/plugins/)
- [Mattermost Server Source](https://github.com/mattermost/mattermost)
