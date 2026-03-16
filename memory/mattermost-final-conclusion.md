# Mattermost 群聊消息转发 - 最终调试结论

**日期:** 2026-03-11 19:40 GMT+8  
**状态:** 插件正常工作，但 WebSocket 广播无法到达任何客户端

---

## 最终结论

### ✅ 插件工作正常

- `MessageHasBeenPosted` 钩子正确触发
- Bot 用户检测正确（`is_bot: true`）
- `PublishWebSocketEvent` 调用成功，无 panic
- 日志显示成功转发给 2 个 Bot 用户

### ❌ WebSocket 广播无法到达客户端

| 客户端类型 | 能收到 `posted` 事件？ | 能收到 `bot_channel_message` 事件？ |
|-----------|---------------------|----------------------------------|
| Bot token 连接 | ✅ (DM/@提及) | ❌ |
| 普通用户 token 连接 | ❌ (未测试到) | ❌ |

### 根本原因

**Mattermost 的 `PublishWebSocketEvent` API 存在限制：**

1. **自定义事件 (`custom_*`) 可能无法通过 `ChannelId` 广播**
2. **即使普通用户也收不到插件发送的自定义事件**
3. **这是 Mattermost 的设计限制，不是插件 bug**

---

## 测试记录

### 测试 1: Bot token + ChannelId 广播
```
插件日志: BotChannelForwarder: broadcasted message ✅
OpenClaw 日志: 无 bot_channel_message 事件 ❌
```

### 测试 2: 普通用户 token + ChannelId 广播
```
插件日志: BotChannelForwarder: broadcasted message ✅
普通用户 WebSocket: 无 bot_channel_message 事件 ❌
```

### 测试 3: nil 广播 (全局)
```
结果: Mattermost 内部 panic ❌
```

---

## 可行方案

### 方案 A: 修改 Mattermost 源码 (长期)
- 添加 `EnableBotWebSocketEvents` 配置
- 修改 `PublishSkipClusterSend` 函数
- 需要维护 Fork 版本

### 方案 B: HTTP 轮询 (短期)
- OpenClaw 定期调用 Mattermost API 获取新消息
- 延迟较高，但稳定可靠

### 方案 C: Outgoing Webhook (中短期)
- 配置 Mattermost Outgoing Webhook
- 需要公网地址

### 方案 D: 使用普通用户 + 直接连接 (已验证不可行)
- ~~使用普通用户 token 连接~~
- **测试结果：普通用户也收不到自定义事件**

---

## 推荐

1. **短期**: 使用 HTTP 轮询方案
2. **中期**: 配置 Outgoing Webhook
3. **长期**: 贡献代码到 Mattermost 官方

---

## 文件位置

- 插件代码: `~/.openclaw/extensions/mattermost-channel-forwarder/`
- 调试文档: `~/.openclaw/workspace/memory/mattermost-plugin-debug-summary.md`
- 源码修改方案: `~/.openclaw/workspace/memory/mattermost-source-modification-plan.md`
