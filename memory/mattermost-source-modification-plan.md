# Mattermost 源码修改方案 - 支持 Bot 接收群聊消息

## 问题分析

### 当前行为

Mattermost 的 `PublishWebSocketEvent` API 在 `server/channels/app/platform/cluster.go` 中实现：

```go
func (ps *PlatformService) PublishSkipClusterSend(event *model.WebSocketEvent) {
    if event.GetBroadcast().UserId != "" {
        hub := ps.GetHubForUserId(event.GetBroadcast().UserId)
        if hub != nil {
            hub.Broadcast(event)
        }
    } else {
        for _, hub := range ps.hubs {
            hub.Broadcast(event)
        }
    }
}
```

**问题：** `GetHubForUserId` 只返回用户会话的 Hub，**Bot token 连接不在用户的 Hub 中**。

### 根本原因

Mattermost 的 WebSocket 连接管理基于 **用户会话**：
1. 普通用户登录后，WebSocket 连接注册到 `hub[userId]`
2. Bot 使用 token 连接时，**没有关联到用户会话**
3. 因此 `GetHubForUserId(botUserId)` 返回 `nil`

---

## 修改方案

### 方案 1: 修改 `PublishSkipClusterSend` 函数

**文件：** `server/channels/app/platform/cluster.go`

**修改内容：**

```go
func (ps *PlatformService) PublishSkipClusterSend(event *model.WebSocketEvent) {
    broadcast := event.GetBroadcast()
    
    // 原有逻辑：按 UserId 发送
    if broadcast.UserId != "" {
        hub := ps.GetHubForUserId(broadcast.UserId)
        if hub != nil {
            hub.Broadcast(event)
        }
        
        // 新增：同时检查 Bot 用户
        // Bot 可能通过 token 连接，不在用户 Hub 中
        ps.BroadcastToBotConnections(event, broadcast.UserId)
    } else {
        // 广播：发送到所有 Hub
        for _, hub := range ps.hubs {
            hub.Broadcast(event)
        }
        
        // 新增：同时广播给所有 Bot 连接
        ps.BroadcastToAllBotConnections(event)
    }

    ps.SharedChannelSyncHandler(event)
}
```

**新增函数：**

```go
// BroadcastToBotConnections 发送事件给指定 Bot 用户的所有连接
func (ps *PlatformService) BroadcastToBotConnections(event *model.WebSocketEvent, botUserId string) {
    // 检查该用户是否是 Bot
    user, err := ps.Store.User().Get(botUserId)
    if err != nil || !user.IsBot {
        return
    }
    
    // 获取 Bot 的所有 WebSocket 连接
    // Bot token 连接存储在单独的 map 中
    if conns := ps.GetBotConnections(botUserId); conns != nil {
        for _, conn := range conns {
            conn.WriteJSON(event)
        }
    }
}

// BroadcastToAllBotConnections 广播事件给所有 Bot 连接
func (ps *PlatformService) BroadcastToAllBotConnections(event *model.WebSocketEvent) {
    for _, conn := range ps.GetAllBotConnections() {
        conn.WriteJSON(event)
    }
}
```

### 方案 2: 修改 Bot WebSocket 连接注册逻辑

**文件：** `server/channels/app/platform/hub.go`

**当前行为：** Bot token 连接不注册到用户 Hub

**修改内容：** 将 Bot token 连接也注册到 `hub[botUserId]`

```go
func (h *Hub) Register(conn *WebConn) {
    // 原有逻辑
    h.mutex.Lock()
    defer h.mutex.Unlock()
    
    userId := conn.UserId
    
    // 新增：即使是 Bot，也注册到用户 Hub
    // 这样 GetHubForUserId(botUserId) 就能找到 Bot 的连接
    if _, ok := h.users[userId]; !ok {
        h.users[userId] = make(map[string]*WebConn)
    }
    h.users[userId][conn.Id] = conn
}
```

### 方案 3: 添加配置选项（推荐）

**文件：** `server/channels/model/config.go`

**新增配置：**

```go
type PluginSettings struct {
    // ...
    EnableBotWebSocketEvents *bool `json:"enablebotwebsockethandevents"`
}
```

**修改 `PublishSkipClusterSend`：**

```go
func (ps *PlatformService) PublishSkipClusterSend(event *model.WebSocketEvent) {
    broadcast := event.GetBroadcast()
    
    if broadcast.UserId != "" {
        hub := ps.GetHubForUserId(broadcast.UserId)
        if hub != nil {
            hub.Broadcast(event)
        }
        
        // 新增：如果启用了 Bot WebSocket 事件
        if *ps.Config().PluginSettings.EnableBotWebSocketEvents {
            ps.BroadcastToBotConnections(event, broadcast.UserId)
        }
    } else {
        for _, hub := range ps.hubs {
            hub.Broadcast(event)
        }
        
        // 新增：如果启用了 Bot WebSocket 事件
        if *ps.Config().PluginSettings.EnableBotWebSocketEvents {
            ps.BroadcastToAllBotConnections(event)
        }
    }

    ps.SharedChannelSyncHandler(event)
}
```

---

## 实施步骤

### 1. Fork Mattermost 仓库

```bash
git clone https://github.com/mattermost/mattermost.git
cd mattermost
git checkout v11.4.2  # 或当前使用的版本
```

### 2. 应用修改

选择上述方案之一，修改相应文件。

### 3. 构建

```bash
cd server
make build
```

### 4. 构建 Docker 镜像

```dockerfile
# Dockerfile
FROM mattermost/mattermost-team-edition:11.4.2
COPY bin/mattermost /mattermost/bin/mattermost
```

```bash
docker build -t mattermost-custom:11.4.2 .
```

### 5. 更新 docker-compose.yml

```yaml
services:
  mattermost:
    image: mattermost-custom:11.4.2
    # ... 其他配置
```

---

## 风险评估

| 风险 | 级别 | 缓解措施 |
|-----|------|---------|
| 升级困难 | 高 | 维护 patch 文件，每次升级重新应用 |
| 性能影响 | 中 | 添加配置开关，按需启用 |
| 安全风险 | 低 | 只影响 Bot 用户，不影响普通用户 |
| 兼容性 | 中 | 需要测试所有插件功能 |

---

## 推荐方案

**方案 3（添加配置选项）** 是最推荐的方案：

1. **可选启用** - 通过配置控制，不影响现有行为
2. **向后兼容** - 默认关闭，升级无风险
3. **可维护** - 配置化设计，易于调试

---

## 替代方案

如果不想修改 Mattermost 源码，可以考虑：

### 1. HTTP 轮询

OpenClaw 定期调用 Mattermost API 获取新消息：

```typescript
async function pollChannelMessages(channelId: string, since: number) {
    const posts = await mattermost.getPostsSince(channelId, since);
    for (const post of posts) {
        await processMessage(post);
    }
}
```

**优点：** 无需修改 Mattermost  
**缺点：** 延迟较高，API 调用频繁

### 2. Outgoing Webhook

配置 Mattermost Outgoing Webhook，将消息推送到 OpenClaw：

```yaml
# Mattermost 配置
outgoing_webhooks:
  - channel_id: "xxx"
    callback_urls:
      - "http://openclaw:18789/api/channels/mattermost/webhook"
```

**优点：** 实时推送  
**缺点：** 需要公网地址

---

## 结论

**短期方案：** 使用当前插件 + 调试解决 panic 问题  
**中期方案：** 如果插件无法工作，使用 HTTP 轮询  
**长期方案：** 贡献代码到 Mattermost 官方，添加 Bot WebSocket 事件支持
