# Mattermost 群聊消息接收 - 深度反思与重新分析

**日期:** 2026-03-11 19:45 GMT+8  
**状态:** 原理层面存在问题，需要重新审视设计

---

## 一、现有进展总结

### 1.1 问题定义

**原始问题：** Mattermost 不向 Bot 推送不提及 bot 的普通群聊消息。

**现象：**
- Bot 通过 WebSocket 只能收到 DM 和 @提及 的消息
- 群聊中的普通消息不会被推送给 Bot

### 1.2 插件开发进展

| 组件 | 状态 | 说明 |
|-----|------|------|
| 插件安装 | ✅ | `com.openclaw.bot-channel-forwarder v1.0.0` |
| `MessageHasBeenPosted` 钩子 | ✅ | 正确触发 |
| Bot 用户检测 | ✅ | `is_bot: true` 正确识别 |
| `PublishWebSocketEvent` 调用 | ✅ | 无 panic，调用成功 |
| 客户端接收事件 | ❌ | **所有客户端都收不到自定义事件** |

### 1.3 测试结果汇总

| 测试场景 | 插件日志 | Bot token 客户端 | 普通用户客户端 |
|---------|---------|-----------------|---------------|
| `UserId` 广播 | 调用成功 | 未收到事件 | 未测试 |
| `ChannelId` 广播 | 调用成功 | 未收到事件 | 未收到事件 |
| `nil` 广播 | **panic** | N/A | N/A |

---

## 二、深度反思：设计是否正确？

### 2.1 问题 1：API 是否用错了？

**当前使用的 API：**
```go
p.API.PublishWebSocketEvent(
    "bot_channel_message",  // 事件名
    eventData,               // 数据
    &model.WebsocketBroadcast{
        ChannelId: post.ChannelId,  // 广播目标
    },
)
```

**让我重新检查 Mattermost 官方文档中的 API 说明：**

根据 Mattermost 源码 `server/channels/app/platform/cluster.go`：

```go
func (ps *PlatformService) PublishWebSocketEvent(productID string, event string, payload map[string]any, broadcast *model.WebsocketBroadcast) {
    ev := model.NewWebSocketEvent(model.WebsocketEventType(fmt.Sprintf("custom_%v_%v", productID, event)), "", "", "", nil, "")
    ev = ev.SetBroadcast(broadcast).SetData(payload)
    ps.Publish(ev)
}
```

**关键发现：事件名会被加上 `custom_` 前缀！**

实际事件名：`custom_com.openclaw.bot-channel-forwarder_bot_channel_message`

**我们的客户端监听的是 `bot_channel_message`，但实际事件名是 `custom_com.openclaw.bot-channel-forwarder_bot_channel_message`！**

### 2.2 问题 2：广播机制是否理解正确？

**Mattermost 的广播机制（`PublishSkipClusterSend`）：**

```go
func (ps *PlatformService) PublishSkipClusterSend(event *model.WebSocketEvent) {
    if event.GetBroadcast().UserId != "" {
        // 发送给指定用户
        hub := ps.GetHubForUserId(event.GetBroadcast().UserId)
        if hub != nil {
            hub.Broadcast(event)
        }
    } else {
        // 广播给所有 Hub
        for _, hub := range ps.hubs {
            hub.Broadcast(event)
        }
    }
    ps.SharedChannelSyncHandler(event)
}
```

**关键问题：`ChannelId` 广播在哪里？**

**答案：`ChannelId` 广播不在 `PublishSkipClusterSend` 中！** 这个函数只处理 `UserId` 和全局广播。

让我检查 `hub.Broadcast` 的实现，看看 `ChannelId` 是如何处理的。

### 2.3 问题 3：Hub.Broadcast 如何处理 ChannelId？

**需要查看 `hub.Broadcast` 的实现来确认 `ChannelId` 是否被正确处理。**

---

## 三、重新分析：三个可能的问题

### 假设 1：事件名错误（最可能）

**现象：** 客户端监听 `bot_channel_message`，但实际事件名是 `custom_com.openclaw.bot-channel-forwarder_bot_channel_message`

**验证方法：** 监听所有事件，打印事件名

### 假设 2：ChannelId 广播不生效

**现象：** `PublishSkipClusterSend` 只处理 `UserId`，不处理 `ChannelId`

**验证方法：** 使用 `UserId` 广播测试

### 假设 3：Bot/普通用户都不在 Hub 中

**现象：** `hub.Broadcast` 找不到任何连接

**验证方法：** 检查连接是否正确注册到 Hub

---

## 四、下一步验证

### 4.1 验证事件名

修改客户端监听代码，监听**所有事件**并打印事件名：

```javascript
ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    console.log('Event:', msg.event);  // 打印所有事件名
});
```

### 4.2 验证 UserId 广播

修改插件，使用 `UserId` 广播而不是 `ChannelId`：

```go
broadcast := &model.WebsocketBroadcast{
    UserId: botUserId,  // 直接指定用户
}
```

### 4.3 验证 Hub 连接

检查 WebSocket 连接是否正确注册到 Hub。

---

## 五、可能的正确设计

### 5.1 如果事件名是问题

**正确的事件名：** `custom_com.openclaw.bot-channel-forwarder_bot_channel_message`

**客户端需要监听这个完整的事件名。**

### 5.2 如果 ChannelId 广播不生效

**可能需要使用 `UserId` 广播：**
```go
for _, bot := range bots {
    broadcast := &model.WebsocketBroadcast{
        UserId: bot.UserId,
    }
    p.API.PublishWebSocketEvent("bot_channel_message", eventData, broadcast)
}
```

### 5.3 如果都不行

可能需要使用其他 API，如：
- `p.API.SendWebSocketEvent()` (如果存在)
- 或者通过 Mattermost 内部消息机制

---

## 六、拒绝 Webhook 方案的理由

用户明确拒绝 Webhook 方案，因为：
1. 需要公网地址
2. 增加部署复杂度
3. 不是根本解决方案

---

## 七、下一步行动

1. **验证事件名** - 监听所有事件，确认实际事件名
2. **验证 UserId 广播** - 测试直接指定用户 ID
3. **阅读 Hub.Broadcast 源码** - 理解 ChannelId 如何被处理
4. **检查 Mattermost 官方插件** - 看其他插件如何使用 `PublishWebSocketEvent`

---

**结论：设计可能没有错，但 API 使用方式可能有问题。需要进一步验证事件名和广播机制。**
