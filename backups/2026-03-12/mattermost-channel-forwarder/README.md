# Mattermost Bot Channel Forwarder

Mattermost 服务端插件，将频道消息转发给 Bot 用户。

## 功能

- 将公开/私有频道的消息转发给频道中的 Bot 用户
- 通过 WebSocket 自定义事件 `bot_channel_message` 推送
- 排除 Bot 自己的消息，防止循环
- 不转发 DM 和 Group DM（可配置）

## 文件结构

```
mattermost-channel-forwarder/
├── manifest.json              # 插件元数据
├── main.go                    # 插件主代码
├── go.mod                     # Go 依赖
├── Makefile                   # 构建脚本
├── openclaw-mattermost.patch  # OpenClaw 端改动
├── README.md                  # 本文件
└── apply-patch.sh             # 应用 patch 脚本
```

## 构建插件

### 前置条件

- Go 1.21+
- Make

### 构建

```bash
cd ~/.openclaw/extensions/mattermost-channel-forwarder

# 初始化 Go 模块依赖
go mod tidy

# 构建
make build

# 打包
make dist
```

### 输出

- `server/dist/plugin-linux-amd64` - 编译后的插件
- `com.openclaw.bot-channel-forwarder-1.0.0.tar.gz` - 打包的插件

## 安装插件到 Mattermost

### 方式 1: 管理后台

1. Mattermost 管理后台 → System Console → Plugins → Plugin Management
2. 点击 "Upload Plugin"
3. 选择 `com.openclaw.bot-channel-forwarder-1.0.0.tar.gz`
4. 点击 "Enable"

### 方式 2: API

```bash
curl -X POST \
  -H "Authorization: Bearer <admin-token>" \
  -F "plugin=@com.openclaw.bot-channel-forwarder-1.0.0.tar.gz" \
  http://localhost:8065/api/v4/plugins

curl -X POST \
  -H "Authorization: Bearer <admin-token>" \
  http://localhost:8065/api/v4/plugins/com.openclaw.bot-channel-forwarder/enable
```

## OpenClaw 端改动

### 应用 Patch

```bash
cd ~/.openclaw/extensions/mattermost-channel-forwarder
./apply-patch.sh apply
```

### 回滚 Patch

```bash
cd ~/.openclaw/extensions/mattermost-channel-forwarder
./apply-patch.sh revert
```

### 重启 Gateway

```bash
openclaw gateway restart
```

## 验证

1. 安装插件到 Mattermost
2. 应用 OpenClaw patch 并重启 gateway
3. Bot 加入一个测试频道
4. 在频道发消息（不 @提及 Bot）
5. 检查 OpenClaw 日志是否收到消息

```bash
tail -f /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log | grep -i "mattermost\|bot_channel"
```

## 配置（可选）

MVP 版本无配置，后续版本可添加：

- 频道白名单
- Bot 白名单
- 是否转发 DM

## 事件格式

插件发送的 WebSocket 事件：

```json
{
  "event": "bot_channel_message",
  "data": {
    "post_id": "abc123",
    "channel_id": "xyz789",
    "user_id": "user456",
    "message": "Hello world",
    "create_at": 1710123456789,
    ...
  },
  "broadcast": {
    "user_id": "bot_user_id"
  }
}
```

## 故障排查

### 插件未生效

1. 检查插件是否启用：System Console → Plugins
2. 检查 Mattermost 日志：`docker logs mattermost`
3. 确认 Bot 已加入频道

### OpenClaw 未收到消息

1. 确认 patch 已应用
2. 确认 gateway 已重启
3. 检查 OpenClaw 日志

## 升级

1. 禁用旧版本插件
2. 上传新版本
3. 启用新版本
4. 如需重新应用 patch

## 卸载

1. 禁用并删除插件
2. 回滚 OpenClaw patch
3. 重启 gateway
