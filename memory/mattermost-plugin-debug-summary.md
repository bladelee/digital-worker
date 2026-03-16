# Mattermost 群聊消息转发调试总结

**日期:** 2026-03-11  
**状态:** 插件工作正常，但 OpenClaw 未收到消息

---

## 问题背景

Mattermost 服务端不会向 Bot 用户推送不提及 bot 的普通群聊消息。我们开发了一个 Mattermost 服务端插件来解决这个问题。

---

## 当前状态

### ✅ Mattermost 插件工作正常

| 组件 | 状态 | 说明 |
|-----|------|------|
| 插件安装 | ✅ | `com.openclaw.bot-channel-forwarder v1.0.2` |
| 钩子触发 | ✅ | `MessageHasBeenPosted` 正确触发 |
| 消息过滤 | ✅ | 只处理公开/私有频道 |
| Bot 检测 | ✅ | 正确识别频道中的 Bot 用户 |
| 事件发送 | ✅ | `PublishWebSocketEvent` 成功调用 |

**插件日志示例:**
```json
{"msg":"BotChannelForwarder: processing post","channel_id":"7na63fak3fydtdefapu3cnha5o","channel_type":"P","message_preview":"group chat12"}
{"msg":"BotChannelForwarder: checking members","member_count":"3"}
{"msg":"BotChannelForwarder: forwarded to bots","count":"2"}
```

### ❌ OpenClaw 未收到消息

| 组件 | 状态 | 说明 |
|-----|------|------|
| WebSocket 连接 | ✅ | `mattermost connected as @tokyocatbot` |
| 标准事件接收 | ✅ | 能收到 DM 和 @提及 的消息 |
| `bot_channel_message` 事件 | ❌ | 未收到插件发送的自定义事件 |

**OpenClaw 日志:** 没有任何 `bot_channel_message` 事件记录

---

## 技术分析

### 数据流

```
用户发消息 → Mattermost Post Service
    ↓
MessageHasBeenPublished Hook 触发
    ↓
插件 processPost() 处理
    ↓
检查频道类型 (Open/Private)
    ↓
排除 Bot 消息 (防止循环)
    ↓
获取频道成员中的 Bot 用户
    ↓
调用 API.PublishWebSocketEvent("bot_channel_message", data, {UserId: botUserId})
    ↓
❌ OpenClaw 未收到事件
```

### 关键代码

**插件发送事件 (main.go):**
```go
func (p *BotChannelForwarderPlugin) forwardToBot(post *model.Post, botUserId string) {
    eventData := map[string]interface{}{
        "post_id":     post.Id,
        "channel_id":  post.ChannelId,
        "user_id":     post.UserId,
        "message":     post.Message,
        // ...
    }
    
    p.API.PublishWebSocketEvent(
        "bot_channel_message",
        eventData,
        &model.WebsocketBroadcast{
            UserId: botUserId,  // 只发送给指定 Bot
        },
    )
}
```

**OpenClaw 接收事件 (monitor-websocket.ts):**
```typescript
if (payload.event === "bot_channel_message") {
    const data = payload.data;
    const post: MattermostPost = {
        id: String(data.post_id ?? ""),
        channel_id: String(data.channel_id ?? ""),
        // ...
    };
    await opts.onPosted(post, payload);
}
```

---

## 问题假设

### 假设 1: Bot Token 连接限制（最可能）

Mattermost 的 `PublishWebSocketEvent` API 可能只发送给**用户会话**，而不发送给 **Bot token 连接的 WebSocket**。

**证据:**
- 插件日志显示 `forwarded to bots count=2`，说明 API 调用成功
- OpenClaw 使用 Bot token (`tuqjxr4o63gwinbabgqwffsida`) 连接
- Bot token 连接可能只能接收标准事件（如 `posted`）

**Bot 用户 ID:** `476t1ssijibozd64g5ibp6xf4c` (tokyocatbot)

### 假设 2: WebSocket Broadcast 目标问题

`WebsocketBroadcast{UserId: botUserId}` 可能需要使用不同的目标方式：
- 可能需要使用 `ChannelId` 而不是 `UserId`
- 或者需要使用 `SessionId`

### 假设 3: Mattermost 版本兼容性

- Mattermost 版本: `11.4.2`
- SDK 版本: `github.com/mattermost/mattermost/server/public v0.2.1`

可能存在 API 变化。

---

## 调试步骤记录

### 1. 初始问题: 钩子名称错误

**问题:** 使用了 `PostHasBeenPublished` 钩子
**解决:** 改为 `MessageHasBeenPosted`（正确的钩子名称）

### 2. 运行时错误: 消息截断

**问题:** `post.Message[:50]` 当消息少于 50 字符时 panic
**解决:** 添加长度检查

### 3. 序列化错误: model.StringArray

**问题:** `gob: type not registered for interface: model.StringArray`
**解决:** 将 `post.FileIds` 转换为 `[]string`

### 4. 序列化错误: model.StringInterface

**问题:** `gob: type not registered for interface: model.StringInterface`
**解决:** 将 `post.Props` 转换为 `map[string]interface{}`

### 5. 当前问题: 事件未到达

**状态:** 插件成功发送，但 OpenClaw 未收到

---

## 文件位置

### Mattermost 插件

```
~/.openclaw/extensions/mattermost-channel-forwarder/
├── main.go                    # 插件主代码
├── manifest.json              # 插件元数据
├── go.mod                     # Go 模块定义
├── go.sum                     # Go 依赖校验
├── Makefile                   # 构建脚本
├── build-docker.sh            # Docker 构建脚本
├── openclaw-mattermost.patch  # OpenClaw 改动 patch
├── apply-patch.sh             # Patch 应用/回滚脚本
├── README.md                  # 使用说明
└── server/dist/
    └── plugin-linux-amd64     # 编译后的插件二进制
```

### OpenClaw 改动

```
~/.openclaw/extensions/node_modules/openclaw/extensions/mattermost/src/mattermost/monitor-websocket.ts
```

添加了 `bot_channel_message` 事件处理代码（约 26 行）

### 已安装插件位置

```
/var/lib/docker/volumes/mattermost_mattermost_plugins/_data/com.openclaw.bot-channel-forwarder/
├── plugin.json
└── server/dist/plugin-linux-amd64
```

---

## 下一步调试方向

### 1. 验证 Bot Token 连接限制

- 检查 Mattermost 官方文档关于 Bot 和 WebSocket 事件的说明
- 测试使用用户 token 而不是 Bot token 连接

### 2. 尝试不同的 Broadcast 目标

```go
// 尝试使用 ChannelId
&model.WebsocketBroadcast{
    ChannelId: post.ChannelId,
}

// 尝试不指定目标（广播）
p.API.PublishWebSocketEvent("bot_channel_message", eventData, nil)
```

### 3. 添加插件调试日志

在 `forwardToBot` 中添加更多日志：
```go
p.API.LogInfo("BotChannelForwarder: sending to bot",
    "bot_user_id", botUserId,
    "event_data_keys", strings.Join(getKeys(eventData), ","))
```

### 4. 检查 Mattermost 服务端日志

查看 WebSocket 事件发送的详细日志：
```bash
# 启用 DEBUG 日志级别
# 检查 WebSocket 事件发送记录
```

### 5. 替代方案

如果 `PublishWebSocketEvent` 确实不支持 Bot token 连接：

**方案 A: HTTP 轮询**
- OpenClaw 定期轮询 Mattermost API 获取新消息

**方案 B: Outgoing Webhook**
- 配置 Mattermost Outgoing Webhook
- OpenClaw 提供 HTTP endpoint 接收消息

**方案 C: 修改 Mattermost 源码**
- 深入 Mattermost 源码，修改 Bot WebSocket 事件处理

---

## 相关文档

- 问题分析: `~/.openclaw/workspace/memory/mattermost-group-chat-analysis.md`
- 设计文档: `~/.openclaw/workspace/memory/mattermost-plugin-design.md`
- 本调试总结: `~/.openclaw/workspace/memory/mattermost-plugin-debug-summary.md`

---

## 环境信息

| 组件 | 版本 |
|-----|------|
| Mattermost | 11.4.2 |
| Mattermost SDK | v0.2.1 |
| Go | 1.24 |
| OpenClaw | 2026.3.8 |
| Node.js | 22.22.1 |

---

**最后更新:** 2026-03-11 16:52 GMT+8
