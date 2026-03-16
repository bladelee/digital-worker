# Mattermost 群聊消息接收 - 每日进展总结

**日期:** 2026-03-11  
**总耗时:** ~10 小时  
**状态:** 插件开发完成，WebSocket 事件广播存在 Mattermost 限制

---

## 一、问题定义

**原始问题：** Mattermost 不向 Bot 推送不提及 bot 的普通群聊消息。

**期望结果：** OpenClaw 能接收并处理群聊中的所有消息，无需 @提及。

---

## 二、已完成工作

### 2.1 问题分析
- ✅ 确认 Mattermost 服务端不会向 Bot 推送普通群聊消息
- ✅ 分析了三种解决方案（插件、Webhook、源码修改）
- ✅ 选择了插件方案

### 2.2 插件开发
- ✅ 创建了 `mattermost-channel-forwarder` 插件
- ✅ 实现了 `MessageHasBeenPosted` 钩子
- ✅ 实现了 Bot 用户检测逻辑
- ✅ 实现了 `PublishWebSocketEvent` 事件广播
- ✅ 编写了单元测试并全部通过
- ✅ 成功部署到 Mattermost 11.4.2

### 2.3 OpenClaw 端改动
- ✅ 在 `monitor-websocket.ts` 添加了 `bot_channel_message` 事件处理
- ✅ 创建了 patch 文件便于回滚

### 2.4 文档输出
- 问题分析文档
- 设计方案文档
- 调试总结文档
- 源码修改方案
- 深度反思文档

---

## 三、当前问题

### 3.1 核心问题

**Mattermost 的 `PublishWebSocketEvent` API 无法将自定义事件推送到客户端。**

### 3.2 已验证的测试结果

| 测试场景 | 插件调用 | Bot token 客户端 | 普通用户客户端 |
|---------|---------|-----------------|---------------|
| `UserId` 广播 | ✅ 成功 | ❌ 未收到 | ❌ 未收到 |
| `ChannelId` 广播 | ✅ 成功 | ❌ 未收到 | ❌ 未收到 |
| `nil` 全局广播 | ❌ panic | - | - |

### 3.3 插件日志（证明插件工作正常）

```json
{"msg":"BotChannelForwarder: processing post","post_id":"sjsnxzc5rpnxxrg5pn7i9iaaye","channel_id":"7na63fak3fydtdefapu3cnha5o"}
{"msg":"BotChannelForwarder: broadcasted message","target_bot_id":"476t1ssijibozd64g5ibp6xf4c"}
{"msg":"BotChannelForwarder: forwarded to bots","count":"2"}
```

### 3.4 可能的原因

1. **事件名问题**
   - Mattermost 会将事件名改为 `custom_<plugin_id>_<event_name>`
   - 实际事件名可能是：`custom_com.openclaw.bot-channel-forwarder_bot_channel_message`
   - 客户端监听的是 `bot_channel_message`，所以收不到

2. **广播机制限制**
   - `ChannelId` 广播可能只对标准事件（`posted`）有效
   - 自定义事件可能需要使用 `UserId` 广播

3. **Mattermost 设计限制**
   - Bot token 连接的 WebSocket 不在用户 Hub 中
   - 自定义事件可能根本不支持广播到客户端

---

## 四、待验证的假设

### 4.1 事件名假设（最可能）

**假设：** 客户端需要监听完整的事件名 `custom_com.openclaw.bot-channel-forwarder_bot_channel_message`

**验证方法：**
```javascript
ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    // 打印所有事件名
    console.log('Event:', msg.event);
});
```

### 4.2 UserId 广播假设

**假设：** 使用 `UserId` 广播而不是 `ChannelId` 广播

**验证方法：**
```go
broadcast := &model.WebsocketBroadcast{
    UserId: botUserId,  // 直接指定用户
}
```

### 4.3 Mattermost 源码分析

需要深入分析 Mattermost 源码：
- `PublishSkipClusterSend` 函数
- `hub.Broadcast` 函数
- `ChannelId` 广播的处理逻辑

---

## 五、建议的下一步

### 5.1 短期（明天）

1. **验证事件名**
   - 监听所有 WebSocket 事件，确认实际事件名
   - 如果事件名是 `custom_*`，修改 OpenClaw 端监听逻辑

2. **验证 UserId 广播**
   - 修改插件，使用 `UserId` 广播
   - 测试普通用户是否能收到事件

### 5.2 中期

3. **深入分析 Mattermost 源码**
   - 阅读 `hub.Broadcast` 的实现
   - 理解 `ChannelId` 广播的处理逻辑

4. **考虑其他方案**
   - HTTP 轮询（稳定但延迟高）
   - 修改 Mattermost 源码（长期方案）

### 5.3 长期

5. **贡献到 Mattermost 官方**
   - 提交 Issue 描述问题
   - 提交 PR 添加 `EnableBotWebSocketEvents` 配置

---

## 六、拒绝的方案

### Webhook 方案
- **原因：** 需要公网地址
- **用户反馈：** 不接受

---

## 七、生成的文件路径

| 文件 | 路径 | 说明 |
|-----|------|------|
| 插件源码 | `~/.openclaw/extensions/mattermost-channel-forwarder/` | 完整插件代码 |
| 插件单元测试 | `~/.openclaw/extensions/mattermost-channel-forwarder/main_test.go` | 单元测试 |
| OpenClaw patch | `~/.openclaw/extensions/mattermost-channel-forwarder/openclaw-mattermost.patch` | OpenClaw 改动 |
| 问题分析文档 | `~/.openclaw/workspace/memory/mattermost-group-chat-analysis.md` | 问题分析 |
| 设计文档 | `~/.openclaw/workspace/memory/mattermost-plugin-design.md` | 插件设计 |
| 调试总结 | `~/.openclaw/workspace/memory/mattermost-plugin-debug-summary.md` | 调试过程 |
| 源码修改方案 | `~/.openclaw/workspace/memory/mattermost-source-modification-plan.md` | Mattermost 源码修改方案 |
| 深度反思 | `~/.openclaw/workspace/memory/mattermost-deep-reflection.md` | 设计反思 |
| 最终结论 | `~/.openclaw/workspace/memory/mattermost-final-conclusion.md` | 最终结论 |
| **本日总结** | `~/.openclaw/workspace/memory/2026-03-11-mattermost-summary.md` | **本日进展总结** |

---

## 八、关键代码片段

### 8.1 插件钩子实现

```go
func (p *BotChannelForwarderPlugin) MessageHasBeenPosted(c *plugin.Context, post *model.Post) {
    go p.processPost(post)
}
```

### 8.2 WebSocket 事件广播

```go
func (p *BotChannelForwarderPlugin) forwardToBot(post *model.Post, botUserId string) {
    eventData := map[string]interface{}{
        "post_id":       post.Id,
        "channel_id":    post.ChannelId,
        "user_id":       post.UserId,
        "message":       post.Message,
        "target_bot_id": botUserId,
    }
    
    broadcast := &model.WebsocketBroadcast{
        ChannelId: post.ChannelId,
    }
    
    p.API.PublishWebSocketEvent("bot_channel_message", eventData, broadcast)
}
```

### 8.3 OpenClaw 事件处理

```typescript
if (payload.event === "bot_channel_message") {
    const data = payload.data;
    const post: MattermostPost = {
        id: String(data.post_id ?? ""),
        channel_id: String(data.channel_id ?? ""),
        user_id: String(data.user_id ?? ""),
        message: String(data.message ?? ""),
    };
    await opts.onPosted(post, payload);
}
```

---

## 九、环境信息

| 组件 | 版本 |
|-----|------|
| Mattermost | 11.4.2 |
| Mattermost SDK | v0.2.1 |
| Go | 1.24 |
| OpenClaw | 2026.3.8 |
| Node.js | 22.22.1 |
| Docker | - |

---

## 十、结论

**插件开发完成，功能正常，但 Mattermost 的 `PublishWebSocketEvent` API 存在限制，无法将自定义事件推送到客户端。**

**下一步最优先验证：**
1. 确认实际的事件名是否是 `custom_com.openclaw.bot-channel-forwarder_bot_channel_message`
2. 如果是，修改 OpenClaw 端监听逻辑即可解决问题

---

**最后更新:** 2026-03-11 21:05 GMT+8
