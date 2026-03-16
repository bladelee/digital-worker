# Mattermost 架构分析报告

**日期:** 2026-03-11  
**目的:** 分析 Mattermost 的消息分发和插件扩展架构

---

## 一、Mattermost 整体架构

### 1.1 系统架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Mattermost Server                               │
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐│
│  │   API Layer │  │  WebSocket  │  │   Jobs      │  │    Plugin System    ││
│  │   (REST)    │  │   Layer     │  │   System    │  │                     ││
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘│
│         │                │                │                    │           │
│         └────────────────┴────────────────┴────────────────────┘           │
│                                      │                                      │
│                          ┌───────────▼───────────┐                         │
│                          │    Platform Service   │                         │
│                          │    (Core Business)    │                         │
│                          └───────────┬───────────┘                         │
│                                      │                                      │
│         ┌────────────────────────────┼────────────────────────────┐        │
│         │                            │                            │        │
│  ┌──────▼──────┐  ┌─────────────────▼─────────────────┐  ┌──────▼──────┐ │
│  │    Store    │  │            Hub System              │  │   Cluster   │ │
│  │  (Database) │  │  (WebSocket Connection Manager)    │  │   Service   │ │
│  └─────────────┘  └───────────────────────────────────┘  └─────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 核心目录结构

```
mattermost/server/
├── channels/
│   ├── api4/           # REST API 端点
│   ├── app/            # 核心应用逻辑
│   │   ├── platform/   # 平台服务（Hub、WebConn等）
│   │   ├── plugin*.go  # 插件系统
│   │   └── ...
│   ├── wsapi/          # WebSocket API
│   ├── store/          # 数据库访问层
│   └── web/            # Web 处理
├── platform/           # 平台级服务
└── public/
    ├── model/          # 数据模型
    └── plugin/         # 插件 SDK
```

---

## 二、消息分发架构

### 2.1 WebSocket 连接管理 - Hub 系统

**文件:** `server/channels/app/platform/web_hub.go`

#### Hub 结构

```go
type Hub struct {
    connectionCount int64
    platform        *PlatformService
    connectionIndex int
    
    // 通道
    register        chan *webConnRegisterMessage  // 注册连接
    unregister      chan *WebConn                  // 注销连接
    broadcast       chan *model.WebSocketEvent     // 广播消息
    stop            chan struct{}                  // 停止信号
    directMsg       chan *webConnDirectMessage     // 直接消息
    
    // 钩子
    broadcastHooks  map[string]BroadcastHook
}
```

#### Hub 广播流程

```go
func (h *Hub) Broadcast(message *model.WebSocketEvent) {
    if h != nil && message != nil {
        select {
        case h.broadcast <- message:  // 发送到广播通道
        case <-h.stop:
        }
    }
}
```

### 2.2 消息分发核心 - PublishSkipClusterSend

**文件:** `server/channels/app/platform/cluster.go`

```go
func (ps *PlatformService) PublishSkipClusterSend(event *model.WebSocketEvent) {
    // 1. 如果指定了 UserId，只发送给该用户的 Hub
    if event.GetBroadcast().UserId != "" {
        hub := ps.GetHubForUserId(event.GetBroadcast().UserId)
        if hub != nil {
            hub.Broadcast(event)
        }
    } else {
        // 2. 否则广播到所有 Hub
        for _, hub := range ps.hubs {
            hub.Broadcast(event)
        }
    }
    
    // 3. 通知共享频道同步服务
    ps.SharedChannelSyncHandler(event)
}
```

**关键发现：** `PublishSkipClusterSend` 只处理 `UserId`，不处理 `ChannelId`！

### 2.3 Hub 内部的 ChannelId 处理

**文件:** `server/channels/app/platform/web_hub.go` (第 690-740 行)

```go
case msg := <-h.broadcast:
    broadcast := func(webConn *WebConn) {
        if webConn.ShouldSendEvent(msg) {
            select {
            case webConn.send <- h.runBroadcastHooks(msg, webConn, ...):
            default:
                // 连接慢，关闭
                closeAndRemoveConn(connIndex, webConn)
            }
        }
    }

    // 1. 快速返回：指定 ConnectionId
    if webConn := connIndex.ForConnection(msg.GetBroadcast().ConnectionId); webConn != nil {
        broadcast(webConn)
        continue
    }

    // 2. 指定 UserId
    if userID := msg.GetBroadcast().UserId; userID != "" {
        targetConns = connIndex.ForUser(userID)
    } 
    // 3. 指定 ChannelId（如果启用快速迭代）
    else if channelID := msg.GetBroadcast().ChannelId; channelID != "" && fastIteration {
        targetConns = connIndex.ForChannel(channelID)
    }
    
    if targetConns != nil {
        for webConn := range targetConns {
            broadcast(webConn)
        }
        continue
    }

    // 4. 全局广播：发送给所有连接
    for webConn := range connIndex.All() {
        broadcast(webConn)
    }
```

### 2.4 WebConn.ShouldSendEvent - 消息过滤

**文件:** `server/channels/app/platform/web_conn.go` (第 879-1010 行)

```go
func (wc *WebConn) ShouldSendEvent(msg *model.WebSocketEvent) bool {
    // 1. 必须已认证
    if !wc.IsAuthenticated() {
        return false
    }

    // 2. 指定 ConnectionId
    if msg.GetBroadcast().ConnectionId != "" {
        return wc.GetConnectionID() == msg.GetBroadcast().ConnectionId
    }

    // 3. 指定 UserId
    if msg.GetBroadcast().UserId != "" {
        return wc.UserId == msg.GetBroadcast().UserId
    }

    // 4. 指定 ChannelId - 检查用户是否在频道中
    if chID := msg.GetBroadcast().ChannelId; chID != "" {
        if *wc.Platform.Config().ServiceSettings.EnableWebHubChannelIteration {
            return true  // 已经在 Hub 层过滤了
        }
        
        // 检查用户是否是频道成员
        if _, ok := wc.allChannelMembers[chID]; ok {
            return true
        }
        return false
    }

    // 5. 指定 TeamId
    if msg.GetBroadcast().TeamId != "" {
        return wc.isMemberOfTeam(msg.GetBroadcast().TeamId)
    }

    return true
}
```

---

## 三、插件扩展架构

### 3.1 插件系统结构

```
server/public/plugin/
├── api.go                    # 插件 API 接口
├── hooks.go                  # 插件钩子接口
├── client_rpc.go             # RPC 客户端
├── environment.go            # 插件环境
└── supervisor.go             # 插件监督器

server/channels/app/
├── plugin.go                 # 插件管理
├── plugin_api.go             # 插件 API 实现
├── plugin_install.go         # 插件安装
└── plugin_hooks_test.go      # 钩子测试
```

### 3.2 插件钩子接口

**文件:** `server/public/plugin/hooks.go`

```go
type Hooks interface {
    // 消息相关钩子
    MessageHasBeenPosted(c *Context, post *model.Post)
    MessageWillBePosted(c *Context, post *model.Post) (*model.Post, string)
    MessageWillBeUpdated(c *Context, newPost, oldPost *model.Post) (*model.Post, string)
    MessageHasBeenUpdated(c *Context, newPost, oldPost *model.Post)
    
    // 频道相关钩子
    ChannelHasBeenCreated(c *Context, channel *model.Channel)
    UserHasBeenCreated(c *Context, user *model.User)
    UserHasLoggedIn(c *Context, user *model.User)
    
    // 反应钩子
    ReactionHasBeenAdded(c *Context, reaction *model.Reaction)
    ReactionHasBeenRemoved(c *Context, reaction *model.Reaction)
    
    // 文件钩子
    FileWillBeUploaded(c *Context, upload *model.FileUploadJob) (*model.FileUploadJob, string)
    
    // ... 更多钩子
}
```

### 3.3 插件 API - PublishWebSocketEvent

**文件:** `server/channels/app/platform/cluster.go` (第 70 行)

```go
func (ps *PlatformService) PublishWebSocketEvent(
    productID string, 
    event string, 
    payload map[string]any, 
    broadcast *model.WebsocketBroadcast,
) {
    // 事件名格式: custom_<plugin_id>_<event_name>
    ev := model.NewWebSocketEvent(
        model.WebsocketEventType(fmt.Sprintf("custom_%v_%v", productID, event)), 
        "", "", "", nil, "",
    )
    ev = ev.SetBroadcast(broadcast).SetData(payload)
    ps.Publish(ev)
}
```

**关键发现：**
1. 事件名被修改为 `custom_<plugin_id>_<event_name>`
2. 我们的事件实际名称是 `custom_com.openclaw.bot-channel-forwarder_bot_channel_message`

---

## 四、关键发现与问题定位

### 4.1 为什么插件发送的事件收不到？

**问题定位：**

1. **事件名问题** ✅ 已确认
   - 实际事件名: `custom_com.openclaw.bot-channel-forwarder_bot_channel_message`
   - 客户端监听: `bot_channel_message`
   - **这是主要问题！**

2. **ChannelId 广播问题**
   - `PublishSkipClusterSend` 不直接处理 `ChannelId`
   - `ChannelId` 在 Hub 的 `Start()` 方法中处理
   - 需要 `EnableWebHubChannelIteration` 配置启用

3. **WebConn 过滤问题**
   - `ShouldSendEvent` 会检查用户是否是频道成员
   - Bot 用户可能没有正确的频道成员缓存

### 4.2 消息分发流程图

```
插件调用 PublishWebSocketEvent
        │
        ▼
┌───────────────────────────────────┐
│ 创建 WebSocketEvent               │
│ 事件名: custom_<id>_<event>       │
│ 设置 broadcast (UserId/ChannelId) │
└───────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────┐
│ PlatformService.Publish           │
│ 1. PublishSkipClusterSend         │
│ 2. 发送到集群（如果启用）          │
└───────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────┐
│ PublishSkipClusterSend            │
│                                   │
│ if UserId != "" {                 │
│   GetHubForUserId(UserId)         │  ← Bot 用户可能没有 Hub
│   hub.Broadcast(event)            │
│ } else {                          │
│   for hub := range hubs {         │  ← 全局广播
│     hub.Broadcast(event)          │
│   }                               │
│ }                                 │
└───────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────┐
│ Hub.Broadcast                     │
│ 发送消息到 hub.broadcast 通道      │
└───────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────┐
│ Hub.Start() 主循环                │
│                                   │
│ case msg := <-h.broadcast:        │
│                                   │
│ if UserId != "" {                 │
│   ForUser(UserId)                 │  ← 获取用户的所有连接
│ } else if ChannelId != "" {       │
│   ForChannel(ChannelId)           │  ← 获取频道的所有连接
│ } else {                          │
│   All()                           │  ← 所有连接
│ }                                 │
│                                   │
│ for webConn := range targetConns {│
│   if webConn.ShouldSendEvent(msg){│  ← 过滤检查
│     webConn.send <- msg           │
│   }                               │
│ }                                 │
└───────────────────────────────────┘
```

---

## 五、配置影响

### 5.1 EnableWebHubChannelIteration

**文件:** `config.json`

```json
{
  "ServiceSettings": {
    "EnableWebHubChannelIteration": true
  }
}
```

**作用:** 
- 启用后，Hub 可以按频道迭代连接
- 禁用时，所有频道消息都会广播到所有连接，然后由 `ShouldSendEvent` 过滤

### 5.2 WebSocketEventScope

**Feature Flag:** 控制特定事件（typing、reaction）的范围过滤

---

## 六、总结

### 6.1 架构特点

1. **分层设计**
   - API 层 → 应用层 → 平台层 → 存储层
   - 每层职责明确

2. **Hub 系统**
   - 管理所有 WebSocket 连接
   - 支持按用户、频道、团队过滤
   - 使用通道实现异步消息传递

3. **插件系统**
   - 基于哈希插件的 RPC 机制
   - 丰富的钩子接口
   - 沙箱隔离

### 6.2 我们的问题根因

1. **事件名不匹配** - 客户端需要监听完整事件名
2. **ChannelId 广播依赖配置** - 需要 `EnableWebHubChannelIteration`
3. **Bot 连接可能不在 Hub 中** - Bot token 连接的注册机制可能不同

---

## 七、下一步验证

1. **验证事件名** - 监听 `custom_com.openclaw.bot-channel-forwarder_bot_channel_message`
2. **检查配置** - 确认 `EnableWebHubChannelIteration` 是否启用
3. **调试 WebConn 注册** - 确认 Bot token 连接是否正确注册到 Hub
