# Mattermost Bot Channel Forwarder 插件

## 项目概述

**插件名称:** Bot Channel Forwarder  
**插件 ID:** `com.openclaw.bot-channel-forwarder`  
**版本:** 1.0.1  
**目标:** 解决 Mattermost 不向 Bot 推送普通群聊消息的问题

---

## 架构设计

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

---

## 代码 Review

### 1. 插件主代码 (main.go)

**文件位置:** `~/.openclaw/extensions/mattermost-channel-forwarder/main.go`

#### 代码结构

```go
package main

import (
    "sync"
    "github.com/mattermost/mattermost/server/public/model"
    "github.com/mattermost/mattermost/server/public/plugin"
)

type BotChannelForwarderPlugin struct {
    plugin.MattermostPlugin
    configLock sync.RWMutex
}
```

#### 实现的钩子

| 钩子 | 说明 | 实现状态 |
|-----|------|---------|
| `OnActivate` | 插件激活时调用 | ✅ 记录日志 |
| `OnDeactivate` | 插件停用时调用 | ✅ 记录日志 |
| `PostHasBeenPublished` | 帖子发布后调用 | ✅ 异步处理 |

#### 消息处理流程

```
PostHasBeenPublished(c, post)
    │
    ├─▶ go processPost(post)  // 异步处理，不阻塞
    │
    └─▶ processPost(post)
            │
            ├─▶ 检查是否已删除 (DeleteAt > 0)
            ├─▶ 获取频道信息
            ├─▶ 检查频道类型 (Open/Private)
            ├─▶ 获取发送者信息
            ├─▶ 排除 Bot 消息 (防止循环)
            ├─▶ 获取频道成员
            ├─▶ 遍历成员，找到 Bot 用户
            └─▶ 调用 forwardToBot() 发送 WebSocket 事件
```

#### 代码质量评估

| 方面 | 评分 | 说明 |
|-----|------|------|
| 可读性 | ⭐⭐⭐⭐ | 代码结构清晰，注释充分 |
| 错误处理 | ⭐⭐⭐⭐ | 所有 API 调用都有错误检查 |
| 性能 | ⭐⭐⭐⭐⭐ | 异步处理，不阻塞主流程 |
| 安全性 | ⭐⭐⭐⭐ | 排除 Bot 消息防止循环 |
| 可维护性 | ⭐⭐⭐⭐ | 代码结构清晰，易于扩展 |

#### 潜在改进点

1. **消息截断风险**
   ```go
   "message_preview", post.Message[:50]  // 如果消息少于50字符会 panic
   ```
   建议改为：
   ```go
   preview := post.Message
   if len(preview) > 50 {
       preview = preview[:50]
   }
   ```

2. **配置化**
   - 当前频道类型和 Bot 白名单是硬编码的
   - 建议添加配置支持

3. **缓存优化**
   - 频道成员查询可以添加缓存
   - 减少频繁的 API 调用

### 2. 插件配置 (manifest.json)

**文件位置:** `~/.openclaw/extensions/mattermost-channel-forwarder/manifest.json`

```json
{
  "id": "com.openclaw.bot-channel-forwarder",
  "name": "Bot Channel Forwarder",
  "description": "Forward channel messages to bot users via WebSocket for OpenClaw integration",
  "version": "1.0.1",
  "min_server_version": "9.0.0",
  "server": {
    "executables": {
      "linux-amd64": "server/dist/plugin-linux-amd64"
    }
  }
}
```

#### 配置说明

| 字段 | 值 | 说明 |
|-----|---|------|
| `id` | `com.openclaw.bot-channel-forwarder` | 插件唯一标识 |
| `min_server_version` | `9.0.0` | 最低 Mattermost 版本 |
| `server.executables` | `linux-amd64` | 只编译了 Linux AMD64 |

**改进建议:**
- 添加更多平台支持 (darwin-arm64, windows-amd64)
- 添加 `settings_schema` 支持配置界面

### 3. OpenClaw 端改动 (patch)

**文件位置:** `~/.openclaw/extensions/mattermost-channel-forwarder/openclaw-mattermost.patch`

```typescript
// Handle custom bot_channel_message event from mattermost-channel-forwarder plugin
if (payload.event === "bot_channel_message") {
    const data = payload.data;
    if (!data) {
        return;
    }
    const post: MattermostPost = {
        id: String(data.post_id ?? ""),
        // ... 其他字段
    };
    try {
        await opts.onPosted(post, payload);
    } catch (err) {
        opts.runtime.error?.(`mattermost bot_channel_message handler failed: ${String(err)}`);
    }
    return;
}
```

#### 代码质量评估

| 方面 | 评分 | 说明 |
|-----|------|------|
| 兼容性 | ⭐⭐⭐⭐⭐ | 不影响原有逻辑，只添加新事件处理 |
| 防御性编程 | ⭐⭐⭐⭐⭐ | 使用 `??` 空值合并，类型转换安全 |
| 错误处理 | ⭐⭐⭐⭐⭐ | try-catch 包裹，记录错误日志 |

---

## 容器重启持久性分析

### Docker 卷配置

Mattermost 容器使用以下 Docker 卷：

| 卷名 | 容器路径 | 用途 |
|-----|---------|------|
| `mattermost_mattermost_config` | `/mattermost/config` | 配置文件 |
| `mattermost_mattermost_plugins` | `/mattermost/plugins` | 插件目录 |
| `mattermost_mattermost_client_plugins` | `/mattermost/client/plugins` | 客户端插件 |
| `mattermost_mattermost_logs` | `/mattermost/logs` | 日志 |
| `mattermost_mattermost_bleve_indexes` | `/mattermost/bleve-indexes` | 搜索索引 |

### 插件持久性

**结论: 插件在容器重启后不会丢失** ✅

**原因:**

1. **Docker 卷是持久化的**
   - 插件存储在 `mattermost_mattermost_plugins` 卷中
   - Docker 卷独立于容器生命周期
   - 容器重启/删除后卷数据仍然存在

2. **插件文件位置**
   ```
   /var/lib/docker/volumes/mattermost_mattermost_plugins/_data/
   └── com.openclaw.bot-channel-forwarder/
       ├── plugin.json
       └── server/
           └── dist/
               └── plugin-linux-amd64
   ```

3. **插件状态存储在配置中**
   - 插件启用状态存储在 `config.json` 的 `PluginSettings.PluginStates` 中
   - 配置文件也在持久化卷中

### 容器升级注意事项

| 场景 | 插件是否保留 | 说明 |
|-----|------------|------|
| `docker restart mattermost` | ✅ 保留 | 容器重启，卷不变 |
| `docker stop && docker start` | ✅ 保留 | 容器停止/启动，卷不变 |
| `docker rm && docker run` (相同卷) | ✅ 保留 | 删除容器后用相同卷重建 |
| `docker-compose down && up` | ✅ 保留 | compose 管理的卷不会删除 |
| `docker volume rm` | ❌ 丢失 | 显式删除卷会丢失 |
| 更新镜像 `docker pull && run` | ⚠️ 取决于配置 | 如果用相同卷则保留 |

### 最佳实践

1. **定期备份插件卷**
   ```bash
   docker run --rm -v mattermost_mattermost_plugins:/data -v $(pwd):/backup alpine tar czf /backup/plugins-backup.tar.gz /data
   ```

2. **使用 docker-compose 管理卷**
   ```yaml
   volumes:
     mattermost_plugins:
       external: true
       name: mattermost_mattermost_plugins
   ```

3. **插件源码版本控制**
   - 插件源码保存在 `~/.openclaw/extensions/mattermost-channel-forwarder/`
   - 可以用 git 管理版本

---

## 当前问题诊断

### 问题: PostHasBeenPublished 钩子未被触发

**现象:**
- 插件显示为 Active
- 但 `BotChannelForwarder: processing post` 日志未出现
- Mattermost 日志中无相关处理记录

**可能原因:**

1. **钩子注册问题**
   - Mattermost 插件系统可能需要特定的初始化
   - 检查是否需要实现其他接口

2. **版本兼容性**
   - 当前 Mattermost 版本可能与 SDK 版本不匹配
   - `min_server_version: 9.0.0` 可能与实际版本不符

3. **权限问题**
   - 插件可能缺少必要的 API 权限

**调试建议:**

1. 检查 Mattermost 版本
   ```bash
   curl -s http://127.0.0.1:8065/api/v4/system/version
   ```

2. 启用 Mattermost 调试日志
   ```json
   {
     "LogSettings": {
       "ConsoleLevel": "DEBUG",
       "FileLevel": "DEBUG"
     }
   }
   ```

3. 添加更多日志点
   - 在 `OnActivate` 中记录更多信息
   - 检查插件是否成功注册钩子

---

## 文件清单

```
~/.openclaw/extensions/mattermost-channel-forwarder/
├── main.go                              # 插件主代码
├── manifest.json                         # 插件元数据
├── go.mod                                # Go 模块定义
├── go.sum                                # Go 依赖校验
├── Makefile                              # 构建脚本
├── build-docker.sh                       # Docker 构建脚本
├── apply-patch.sh                        # OpenClaw patch 应用脚本
├── openclaw-mattermost.patch             # OpenClaw 改动 patch
├── README.md                             # 使用说明
└── server/
    └── dist/
        └── plugin-linux-amd64            # 编译后的插件二进制
```

---

## 下一步

1. **调试钩子问题** - 确认为什么 `PostHasBeenPublished` 没有被触发
2. **添加配置支持** - 允许配置频道白名单、Bot 白名单
3. **完善文档** - 添加部署和故障排查指南
4. **提交 PR** - 将 OpenClaw 改动贡献回官方仓库
