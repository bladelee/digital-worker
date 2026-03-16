# Mattermost Bot Channel Forwarder 插件设计方案

**版本:** v1.0-draft  
**日期:** 2026-03-11  
**状态:** 待评审

---

## 1. 背景与目标

### 1.1 问题描述

Mattermost 服务端不会向 Bot 用户推送不提及 bot 的普通群聊消息，导致 OpenClaw 无法响应群聊中的普通消息。

### 1.2 目标

开发一个 Mattermost 服务端插件，将群聊消息主动推送给 Bot 用户，使 OpenClaw 能够接收并处理所有群聊消息。

### 1.3 非目标

- 不修改 Mattermost 核心代码
- 不依赖公网地址（Outgoing Webhook 的局限）
- 不影响 Mattermost 原有性能

---

## 2. 系统架构

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      Mattermost Server                           │
│                                                                  │
│  ┌──────────────┐     ┌──────────────────┐     ┌─────────────┐ │
│  │  Post Service│────▶│  Plugin System   │────▶│  WebSocket  │ │
│  │              │     │                  │     │   Server    │ │
│  └──────────────┘     │  ┌────────────┐  │     └──────┬──────┘ │
│                       │  │  Forwarder │  │            │        │
│                       │  │  Plugin    │  │            │        │
│                       │  └─────┬──────┘  │            │        │
│                       └────────┼─────────┘            │        │
│                                │                      │        │
│                                ▼                      ▼        │
│                       ┌──────────────────────────────────┐    │
│                       │        Bot WebSocket Client      │    │
│                       │        (OpenClaw Gateway)        │    │
│                       └──────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
1. 用户在频道发消息
2. Mattermost Post Service 处理帖子
3. Plugin Hook 拦截 PostWillBePublished 事件
4. Plugin 检查频道类型、Bot 成员关系
5. Plugin 调用 PublishWebSocketEvent 推送给 Bot
6. Bot WebSocket 连接收到自定义事件
7. OpenClaw 处理消息并响应
```

---

## 3. 插件设计

### 3.1 插件元数据

```json
{
  "id": "com.openclaw.bot-channel-forwarder",
  "name": "Bot Channel Forwarder",
  "description": "Forward channel messages to bot users via WebSocket",
  "version": "1.0.0",
  "min_server_version": "9.0.0",
  "server": {
    "executables": {
      "linux-amd64": "server/dist/plugin-linux-amd64",
      "linux-arm64": "server/dist/plugin-linux-arm64",
      "darwin-amd64": "server/dist/plugin-darwin-amd64",
      "darwin-arm64": "server/dist/plugin-darwin-arm64",
      "windows-amd64": "server/dist/plugin-windows-amd64.exe"
    }
  },
  "settings_schema": {
    "settings": [
      {
        "key": "EnableAllChannels",
        "display_name": "Enable for All Channels",
        "type": "bool",
        "default": true,
        "help_text": "Forward messages from all channels where bot is a member"
      },
      {
        "key": "ChannelAllowlist",
        "display_name": "Channel Allowlist",
        "type": "text",
        "default": "",
        "help_text": "Comma-separated channel IDs (only used if EnableAllChannels is false)"
      },
      {
        "key": "BotAllowlist",
        "display_name": "Bot Allowlist",
        "type": "text",
        "default": "",
        "help_text": "Comma-separated bot user IDs to forward to (empty = all bots)"
      },
      {
        "key": "IncludeDmMessages",
        "display_name": "Include DM Messages",
        "type": "bool",
        "default": false,
        "help_text": "Also forward DM messages (normally not needed)"
      },
      {
        "key": "ExcludeBotMessages",
        "display_name": "Exclude Bot Messages",
        "type": "bool",
        "default": true,
        "help_text": "Don't forward messages from other bots"
      }
    ]
  }
}
```

### 3.2 核心代码结构

```
bot-channel-forwarder/
├── manifest.json
├── go.mod
├── go.sum
├── main.go                    # 插件入口
├── configuration.go           # 配置管理
├── plugin.go                  # 插件主逻辑
├── hooks/
│   └── post_hooks.go         # Post 相关钩子
├── filter/
│   ├── channel_filter.go     # 频道过滤逻辑
│   └── bot_filter.go         # Bot 过滤逻辑
├── webhook/
│   └── forwarder.go          # WebSocket 推送逻辑
├── build/                     # 构建脚本
│   └── make.sh
└── server/
    └── dist/                  # 编译产物
```

### 3.3 核心逻辑伪代码

#### 3.3.1 插件主逻辑 (plugin.go)

```go
package main

import (
    "github.com/mattermost/mattermost/server/public/model"
    "github.com/mattermost/mattermost/server/public/plugin"
)

type BotChannelForwarderPlugin struct {
    plugin.MattermostPlugin
    configuration *configuration
}

func (p *BotChannelForwarderPlugin) OnActivate() error {
    // 初始化配置
    p.configuration = &configuration{}
    return p.API.LoadPluginConfiguration(p.configuration)
}

func (p *BotChannelForwarderPlugin) OnDeactivate() error {
    return nil
}
```

#### 3.3.2 Post 钩子 (hooks/post_hooks.go)

```go
package hooks

import (
    "github.com/mattermost/mattermost/server/public/model"
    "github.com/mattermost/mattermost/server/public/plugin"
)

// PostWillBePublished 在帖子发布前调用
// 返回值: (修改后的post, 拒绝原因)
func (p *BotChannelForwarderPlugin) PostWillBePublished(
    c *plugin.Context,
    post *model.Post,
) (*model.Post, string) {
    // 异步处理，不阻塞帖子发布
    go p.processPost(post)
    return post, ""
}

// PostHasBeenPublished 在帖子发布后调用
func (p *BotChannelForwarderPlugin) PostHasBeenPublished(
    c *plugin.Context,
    post *model.Post,
) {
    // 也可以在这里处理，确保帖子已存储
    go p.processPost(post)
}

func (p *BotChannelForwarderPlugin) processPost(post *model.Post) {
    // 1. 检查是否应该转发
    if !p.shouldForward(post) {
        return
    }
    
    // 2. 获取目标 Bot 列表
    bots := p.getTargetBots(post)
    if len(bots) == 0 {
        return
    }
    
    // 3. 推送给每个 Bot
    for _, bot := range bots {
        p.forwardToBot(post, bot)
    }
}
```

#### 3.3.3 频道过滤 (filter/channel_filter.go)

```go
package filter

func (p *BotChannelForwarderPlugin) shouldForward(post *model.Post) bool {
    // 获取频道信息
    channel, err := p.API.GetChannel(post.ChannelId)
    if err != nil {
        p.API.LogError("Failed to get channel", "error", err.Error())
        return false
    }
    
    // 检查频道类型
    switch channel.Type {
    case model.ChannelTypeOpen:     // 公开频道 - 转发
        // continue
    case model.ChannelTypePrivate:  // 私有频道 - 转发
        // continue
    case model.ChannelTypeDirect:   // DM - 根据配置
        return p.configuration.IncludeDmMessages
    case model.ChannelTypeGroup:    // Group DM - 根据配置
        return p.configuration.IncludeDmMessages
    default:
        return false
    }
    
    // 检查频道白名单
    if !p.configuration.EnableAllChannels {
        if !p.isChannelAllowed(channel.Id) {
            return false
        }
    }
    
    // 排除 Bot 自己发的消息（防止循环）
    user, err := p.API.GetUser(post.UserId)
    if err == nil && user.IsBot {
        if p.configuration.ExcludeBotMessages {
            return false
        }
    }
    
    return true
}

func (p *BotChannelForwarderPlugin) isChannelAllowed(channelId string) bool {
    allowlist := strings.Split(p.configuration.ChannelAllowlist, ",")
    for _, id := range allowlist {
        if strings.TrimSpace(id) == channelId {
            return true
        }
    }
    return false
}
```

#### 3.3.4 Bot 过滤 (filter/bot_filter.go)

```go
package filter

func (p *BotChannelForwarderPlugin) getTargetBots(post *model.Post) []*model.Bot {
    // 获取频道成员中的 Bot
    members, err := p.API.GetChannelMembers(post.ChannelId, 0, 100)
    if err != nil {
        p.API.LogError("Failed to get channel members", "error", err.Error())
        return nil
    }
    
    var bots []*model.Bot
    for _, member := range members {
        user, err := p.API.GetUser(member.UserId)
        if err != nil {
            continue
        }
        
        // 只处理 Bot 用户
        if !user.IsBot {
            continue
        }
        
        // 检查 Bot 白名单
        if !p.isBotAllowed(user.Id) {
            continue
        }
        
        // 获取 Bot 详情
        bot, err := p.API.GetBot(user.Id, false)
        if err != nil {
            continue
        }
        
        bots = append(bots, bot)
    }
    
    return bots
}

func (p *BotChannelForwarderPlugin) isBotAllowed(botUserId string) bool {
    if p.configuration.BotAllowlist == "" {
        return true // 空白名单 = 允许所有
    }
    
    allowlist := strings.Split(p.configuration.BotAllowlist, ",")
    for _, id := range allowlist {
        if strings.TrimSpace(id) == botUserId {
            return true
        }
    }
    return false
}
```

#### 3.3.5 WebSocket 推送 (webhook/forwarder.go)

```go
package webhook

import (
    "github.com/mattermost/mattermost/server/public/model"
)

const (
    WebSocketEventBotChannelMessage = "bot_channel_message"
)

func (p *BotChannelForwarderPlugin) forwardToBot(post *model.Post, bot *model.Bot) {
    // 构造事件数据
    eventData := map[string]interface{}{
        "post_id":     post.Id,
        "create_at":   post.CreateAt,
        "update_at":   post.UpdateAt,
        "edit_at":     post.EditAt,
        "delete_at":   post.DeleteAt,
        "is_pinned":   post.IsPinned,
        "user_id":     post.UserId,
        "channel_id":  post.ChannelId,
        "root_id":     post.RootId,
        "parent_id":   post.ParentId,
        "original_id": post.OriginalId,
        "message":     post.Message,
        "type":        post.Type,
        "props":       post.Props,
        "hashtags":    post.Hashtags,
        "file_ids":    post.FileIds,
        "metadata":    post.Metadata,
    }
    
    // 发送 WebSocket 事件给指定 Bot
    p.API.PublishWebSocketEvent(
        WebSocketEventBotChannelMessage,
        eventData,
        &model.WebsocketBroadcast{
            UserId: bot.UserId,  // 只发送给这个 Bot
        },
    )
    
    p.API.LogDebug("Forwarded message to bot",
        "post_id", post.Id,
        "channel_id", post.ChannelId,
        "bot_user_id", bot.UserId,
    )
}
```

### 3.4 OpenClaw 端适配

在 `extensions/mattermost/src/mattermost/monitor-websocket.ts` 中添加新事件处理：

```typescript
// 在 ws.on("message", async (data) => { ... }) 中添加

// 处理插件推送的频道消息
if (payload.event === "bot_channel_message") {
  const postData = payload.data;
  
  // 转换为标准 Post 格式
  const post: MattermostPost = {
    id: postData.post_id,
    create_at: postData.create_at,
    update_at: postData.update_at,
    edit_at: postData.edit_at,
    delete_at: postData.delete_at,
    is_pinned: postData.is_pinned,
    user_id: postData.user_id,
    channel_id: postData.channel_id,
    root_id: postData.root_id,
    parent_id: postData.parent_id,
    original_id: postData.original_id,
    message: postData.message,
    type: postData.type,
    props: postData.props,
    hashtags: postData.hashtags,
    file_ids: postData.file_ids,
    metadata: postData.metadata,
  };
  
  try {
    await opts.onPosted(post, payload);
  } catch (err) {
    opts.runtime.error?.(`mattermost bot_channel_message handler failed: ${String(err)}`);
  }
  return;
}
```

---

## 4. 配置选项

### 4.1 插件配置

| 配置项 | 类型 | 默认值 | 说明 |
|-------|------|-------|------|
| EnableAllChannels | bool | true | 是否对所有频道生效 |
| ChannelAllowlist | string | "" | 频道白名单（逗号分隔的 ID） |
| BotAllowlist | string | "" | Bot 白名单（逗号分隔的 User ID） |
| IncludeDmMessages | bool | false | 是否转发 DM 消息 |
| ExcludeBotMessages | bool | true | 是否排除其他 Bot 的消息 |

### 4.2 配置示例

**场景 1: 所有频道，指定 Bot**
```json
{
  "EnableAllChannels": true,
  "BotAllowlist": "476t1ssijibozd64g5ibp6xf4c"
}
```

**场景 2: 指定频道，所有 Bot**
```json
{
  "EnableAllChannels": false,
  "ChannelAllowlist": "7na63fak3fydtdefapu3cnha5o,r15qhmdxbffxzxani17ia1947r"
}
```

**场景 3: 测试模式（仅特定频道和 Bot）**
```json
{
  "EnableAllChannels": false,
  "ChannelAllowlist": "7na63fak3fydtdefapu3cnha5o",
  "BotAllowlist": "476t1ssijibozd64g5ibp6xf4c"
}
```

---

## 5. 安全考虑

### 5.1 权限控制

- 插件运行在 Mattermost 服务端，具有系统级权限
- 只有管理员可以安装和配置插件
- 通过白名单机制限制转发范围

### 5.2 防止消息循环

```go
// 排除 Bot 自己发的消息
if user.IsBot && p.configuration.ExcludeBotMessages {
    return false
}

// 同时排除 OpenClaw 回复的消息（通过 Props 标记）
if post.Props != nil {
    if _, ok := post.Props["from_openclaw_bot"]; ok {
        return false
    }
}
```

### 5.3 敏感信息

- 不转发已删除的消息（delete_at > 0）
- 不转发系统消息（type 为 system_*）

---

## 6. 性能考虑

### 6.1 异步处理

```go
// 使用 goroutine 异步处理，不阻塞帖子发布
func (p *BotChannelForwarderPlugin) PostWillBePublished(...) {
    go p.processPost(post)
    return post, ""
}
```

### 6.2 缓存策略

```go
// 缓存频道成员列表（TTL 5分钟）
type memberCache struct {
    sync.RWMutex
    data      map[string][]string // channelId -> userIds
    expiresAt map[string]time.Time
}
```

### 6.3 性能指标

| 场景 | 预估延迟 | 影响 |
|-----|---------|------|
| 单频道单 Bot | <10ms | 可忽略 |
| 多频道多 Bot | <50ms | 轻微 |
| 高频消息（>100/s） | 可能积压 | 需要限流 |

### 6.4 限流机制

```go
// 使用令牌桶限流
type rateLimiter struct {
    ticker   *time.Ticker
    tokens   chan struct{}
}

func newRateLimiter(rate int) *rateLimiter {
    rl := &rateLimiter{
        ticker: time.NewTicker(time.Second / time.Duration(rate)),
        tokens: make(chan struct{}, rate),
    }
    go rl.fill()
    return rl
}

func (rl *rateLimiter) fill() {
    for range rl.ticker.C {
        select {
        case rl.tokens <- struct{}{}:
        default:
        }
    }
}

func (rl *rateLimiter) Wait() {
    <-rl.tokens
}
```

---

## 7. 测试计划

### 7.1 单元测试

| 测试用例 | 描述 |
|---------|------|
| TestShouldForward_PublicChannel | 公开频道消息应该转发 |
| TestShouldForward_PrivateChannel | 私有频道消息应该转发 |
| TestShouldForward_DM | DM 消息根据配置决定 |
| TestShouldForward_BotMessage | Bot 消息应该排除 |
| TestShouldForward_DeletedPost | 已删除消息不应转发 |
| TestGetTargetBots_MultipleBots | 多 Bot 成员场景 |
| TestGetTargetBots_NoBots | 无 Bot 成员场景 |
| TestIsChannelAllowed | 频道白名单测试 |
| TestIsBotAllowed | Bot 白名单测试 |

### 7.2 集成测试

| 测试场景 | 步骤 | 预期结果 |
|---------|------|---------|
| 基本转发 | 1. 安装插件 2. Bot 加入频道 3. 发送消息 | Bot 收到 WebSocket 事件 |
| 频道白名单 | 1. 配置白名单 2. 在白名单频道发消息 3. 在非白名单频道发消息 | 只有白名单频道的消息被转发 |
| Bot 白名单 | 1. 配置 Bot 白名单 2. 多 Bot 在频道中 3. 发送消息 | 只有白名单 Bot 收到事件 |
| 防循环 | 1. Bot 响应消息 2. 检查是否触发二次转发 | 不应触发循环 |

### 7.3 压力测试

| 场景 | 消息速率 | 持续时间 | 预期 |
|-----|---------|---------|------|
| 低负载 | 1 msg/s | 10 min | 无延迟 |
| 中负载 | 10 msg/s | 10 min | 延迟 <100ms |
| 高负载 | 100 msg/s | 5 min | 延迟 <500ms，无丢失 |
| 峰值 | 500 msg/s | 1 min | 限流生效，无崩溃 |

---

## 8. 部署计划

### 8.1 构建流程

```bash
# 1. 设置 Go 环境
go version  # 需要 Go 1.21+

# 2. 克隆插件模板
git clone https://github.com/mattermost/mattermost-plugin-starter.git bot-channel-forwarder
cd bot-channel-forwarder

# 3. 复制代码
# ... (复制上述代码文件)

# 4. 构建
make dist

# 5. 打包
tar -czf com.openclaw.bot-channel-forwarder-1.0.0.tar.gz \
    manifest.json \
    server/dist/
```

### 8.2 安装步骤

**方式 1: 管理后台安装**
1. Mattermost 管理后台 → System Console → Plugins → Plugin Management
2. 点击 "Upload Plugin"
3. 选择 `.tar.gz` 文件上传
4. 点击 "Enable"

**方式 2: API 安装**
```bash
curl -X POST \
  -H "Authorization: Bearer <admin-token>" \
  -F "plugin=@com.openclaw.bot-channel-forwarder-1.0.0.tar.gz" \
  http://localhost:8065/api/v4/plugins
```

**方式 3: Docker 卷挂载**
```yaml
# docker-compose.yml
services:
  mattermost:
    volumes:
      - ./plugins/com.openclaw.bot-channel-forwarder:/mattermost/plugins/com.openclaw.bot-channel-forwarder:ro
```

### 8.3 升级流程

1. 在管理后台禁用旧版本插件
2. 上传新版本
3. 启用新版本
4. 验证功能正常

---

## 9. 监控与日志

### 9.1 日志级别

| 级别 | 场景 |
|-----|------|
| ERROR | 获取频道/用户失败、推送失败 |
| WARN | 配置异常、限流触发 |
| INFO | 插件启动/停止 |
| DEBUG | 每次转发详情 |

### 9.2 关键日志

```go
// 启动
p.API.LogInfo("Bot Channel Forwarder plugin activated",
    "version", manifest.Version,
)

// 转发成功
p.API.LogDebug("Forwarded message to bot",
    "post_id", post.Id,
    "channel_id", post.ChannelId,
    "bot_user_id", bot.UserId,
)

// 转发失败
p.API.LogError("Failed to forward message",
    "post_id", post.Id,
    "error", err.Error(),
)

// 限流
p.API.LogWarn("Rate limit triggered",
    "channel_id", post.ChannelId,
)
```

### 9.3 健康检查

插件可以暴露健康检查端点（可选）：

```go
func (p *BotChannelForwarderPlugin) ServeHTTP(c *plugin.Context, w http.ResponseWriter, r *http.Request) {
    switch r.URL.Path {
    case "/health":
        w.WriteHeader(http.StatusOK)
        json.NewEncoder(w).Encode(map[string]interface{}{
            "status": "ok",
            "version": manifest.Version,
        })
    }
}
```

---

## 10. 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|-----|------|------|---------|
| 消息循环 | 中 | 高 | 排除 Bot 消息 + Props 标记 |
| 性能影响 | 低 | 中 | 异步处理 + 限流 |
| 插件崩溃 | 低 | 低 | Mattermost 自动重启插件 |
| 版本兼容性 | 中 | 中 | 指定 min_server_version |
| 配置错误 | 中 | 低 | 提供默认配置 + 文档 |

---

## 11. 后续优化

### 11.1 短期 (v1.1)

- [ ] 添加 Prometheus 指标
- [ ] 支持正则匹配频道名
- [ ] 支持团队级别配置

### 11.2 中期 (v1.2)

- [ ] 消息过滤规则（关键词、正则）
- [ ] 延迟转发（批量推送）
- [ ] 多语言支持

### 11.3 长期 (v2.0)

- [ ] WebUI 配置界面
- [ ] 消息转换/脱敏
- [ ] A/B 测试支持

---

## 12. 评审检查清单

### 12.1 功能完整性

- [ ] 是否支持所有频道类型？
- [ ] 是否正确处理 DM 和 Group DM？
- [ ] 白名单机制是否完整？
- [ ] 是否防止消息循环？

### 12.2 安全性

- [ ] 是否有权限检查？
- [ ] 是否有输入验证？
- [ ] 是否有敏感信息泄露风险？
- [ ] 是否有 DoS 攻击风险？

### 12.3 性能

- [ ] 是否使用异步处理？
- [ ] 是否有缓存机制？
- [ ] 是否有限流机制？
- [ ] 是否有性能测试？

### 12.4 可维护性

- [ ] 代码结构是否清晰？
- [ ] 是否有充分的日志？
- [ ] 是否有单元测试？
- [ ] 是否有文档？

### 12.5 兼容性

- [ ] Mattermost 最低版本是否合理？
- [ ] OpenClaw 端改动是否最小？
- [ ] 是否支持多平台（Linux/Darwin/Windows）？

---

## 13. 附录

### 13.1 Mattermost 插件 API 参考

- [Plugin API Reference](https://pkg.go.dev/github.com/mattermost/mattermost/server/public/plugin)
- [Hooks Reference](https://developers.mattermost.com/extend/plugins/server/hooks/)
- [WebSocket Events](https://developers.mattermost.com/integrate/websocket/)

### 13.2 相关 Issue

- Mattermost 社区相关讨论: https://github.com/mattermost/mattermost/issues/...

### 13.3 术语表

| 术语 | 说明 |
|-----|------|
| Hook | 插件钩子，在特定事件触发时调用 |
| Post | Mattermost 中的消息/帖子 |
| Channel | 频道，包括公开/私有/DM/Group DM |
| Bot | 机器人用户，由系统创建的特殊用户 |
| WebSocket Event | 通过 WebSocket 推送的事件 |

---

**文档结束**

请评审以上设计方案，确认后我将开始开发。
