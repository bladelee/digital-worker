# 数字员工协作平台 - 最终设计文档

**日期:** 2026-03-12  
**版本:** v3.1 (Review 后更新)

---

## 一、核心发现

### 关键洞察

通过测试验证，**普通用户 token 可以接收群聊 `posted` 事件**，这意味着：
1. **不需要 BotChannelForwarder 插件**
2. **不需要网关服务**
3. **不需要 Bot 账号**
4. 数字员工可以直接使用普通用户账号

---

## 二、最终架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                           用户端                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  Mattermost Web/App/Desktop                                   │ │
│  │  - 用户直接使用 Mattermost 客户端                              │ │
│  │  - 数字员工显示为普通用户（有意义的名字）                       │ │
│  │  - 用户知道这是 AI，不是真人                                   │ │
│  └───────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ WebSocket + REST API
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Mattermost 服务器                               │
│  - 标准部署                                                          │
│  - 用户管理、团队管理、频道管理                                       │
│  - 消息推送、存储                                                    │
│  - **不需要任何插件**                                                │
│  - **配置: EnableTeamCreation = false**                             │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                          WebSocket + REST API
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        ▼                           ▼                           ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  OpenClaw (员工1)│    │  OpenClaw (员工2)│    │  OpenClaw (员工3)│
│                 │    │                 │    │                 │
│  - 用户 token   │    │  - 用户 token   │    │  - 用户 token   │
│  - WebSocket    │    │  - WebSocket    │    │  - WebSocket    │
│  - 接收群聊消息  │    │  - 接收群聊消息  │    │  - 接收群聊消息  │
│  - 发送响应     │    │  - 发送响应     │    │  - 发送响应     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
        │                           │                           │
        └───────────────────────────┼───────────────────────────┘
                                    │
                                    │ 配置管理
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      平台管理服务                                    │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────────┐  │
│  │ 用户管理    │ │ 团队管理    │ │ 数字员工管理                │  │
│  │ - 注册      │ │ - 创建      │ │ - 创建/删除                 │  │
│  │ - 登录      │ │ - 限制检查  │ │ - 激活/停用                 │  │
│  │ - 套餐      │ │ - 成员管理  │ │ - 配置推送                  │  │
│  └─────────────┘ └─────────────┘ └─────────────────────────────┘  │
│                                                                      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────────┐  │
│  │ Mattermost  │ │ OpenClaw    │ │ 监控                        │  │
│  │ 连接器      │ │ 配置管理    │ │ - 健康检查                  │  │
│  │             │ │             │ │ - 指标收集                  │  │
│  └─────────────┘ └─────────────┘ └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      数据层                                         │
│  PostgreSQL (用户、团队、数字员工配置)                               │
│  Redis (缓存、会话)                                                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 三、数字员工创建流程

### 3.1 用户操作

```
用户点击"添加数字员工" → 输入名称"小助手" → 选择类型"助手" → 点击创建
```

### 3.2 系统流程

```
平台服务                Mattermost API              OpenClaw
    │                       │                           │
    │  1. 创建用户          │                           │
    │ ─────────────────────>│                           │
    │   POST /api/v4/users  │                           │
    │                       │                           │
    │  2. 返回 user_id      │                           │
    │ <─────────────────────│                           │
    │                       │                           │
    │  3. 生成 token        │                           │
    │ ─────────────────────>│                           │
    │   POST /users/tokens  │                           │
    │                       │                           │
    │  4. 返回 token        │                           │
    │ <─────────────────────│                           │
    │                       │                           │
    │  5. 加入团队          │                           │
    │ ─────────────────────>│                           │
    │                       │                           │
    │  6. 更新 OpenClaw 配置│                           │
    │ ─────────────────────────────────────────────────>│
    │   写入配置 + SIGUSR1  │                           │
    │                       │      7. 重载配置          │
    │                       │      8. 连接 Mattermost   │
    │ <────────────────────────────────────────────────│
    │                       │                           │
```

---

## 四、OpenClaw 配置示例

```json
{
  "channels": {
    "mattermost": {
      "accounts": {
        "worker-001": {
          "name": "小助手",
          "baseUrl": "https://mattermost.example.com",
          "botToken": "用户token",
          "requireMention": false,
          "dmPolicy": "open",
          "allowFrom": ["*"]
        }
      }
    }
  }
}
```

---

## 五、Token 配置与激活流程

### 5.1 管理端生成配置命令

```typescript
POST /api/workers

Request:
{
  "name": "小助手",
  "type": "assistant"
}

Response:
{
  "id": "worker-001",
  "name": "小助手",
  "status": "pending",
  "activation_command": "/mattermost-add worker-001 小助手 pbdu3bb87frtug96fiwoaek1rr"
}
```

### 5.2 用户激活数字员工

```
用户发送: /mattermost-add worker-001 小助手 pbdu3bb87frtug96fiwoaek1rr

OpenClaw: 正在配置数字员工 "小助手"...
          配置已写入
          数字员工 "小助手" 已激活！
```

---

## 六、团队数量限制（软性约束）

### 6.1 Mattermost 配置

```json
{
  "ServiceSettings": {
    "EnableTeamCreation": false
  }
}
```

### 6.2 平台服务配置

```yaml
# platform-config.yaml
teamLimit:
  enabled: true
  planLimits:
    free: 1        # 免费版：1个团队
    pro: 5         # 专业版：5个团队
    enterprise: -1 # 企业版：无限制
```

---

## 七、数据模型

```sql
-- 用户表
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    mattermost_user_id VARCHAR(50),
    plan VARCHAR(20) DEFAULT 'free',
    created_at TIMESTAMP DEFAULT NOW()
);

-- 团队表
CREATE TABLE teams (
    id UUID PRIMARY KEY,
    owner_id UUID REFERENCES users(id),
    mattermost_team_id VARCHAR(50) UNIQUE,
    name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 数字员工表
CREATE TABLE workers (
    id UUID PRIMARY KEY,
    tenant_id UUID REFERENCES users(id),
    team_id UUID REFERENCES teams(id),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) DEFAULT 'assistant',
    mattermost_user_id VARCHAR(50),
    mattermost_token TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 八、错误处理

### 8.1 错误码

```typescript
enum ErrorCode {
  USER_EXISTS = 'USER_EXISTS',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  TEAM_LIMIT_EXCEEDED = 'TEAM_LIMIT_EXCEEDED',
  WORKER_LIMIT_EXCEEDED = 'WORKER_LIMIT_EXCEEDED',
  MATTERMOST_UNAVAILABLE = 'MATTERMOST_UNAVAILABLE',
  CONFIG_PUSH_FAILED = 'CONFIG_PUSH_FAILED',
}
```

### 8.2 错误响应

```typescript
interface ErrorResponse {
  code: ErrorCode;
  message: string;
  retryable: boolean;
}
```

---

## 九、监控和健康检查

### 9.1 健康检查 API

```
GET /api/health

Response:
{
  "status": "healthy",
  "components": {
    "database": "ok",
    "mattermost": "ok",
    "openclaw": "ok"
  }
}
```

### 9.2 Prometheus 指标

```
platform_user_registrations_total
platform_worker_creations_total
platform_api_latency_seconds
platform_errors_total
```

---

## 十、测试方案

### 10.1 单元测试

| 模块 | 测试项 | 数量 |
|-----|--------|------|
| 用户管理 | 注册、登录、套餐 | 10 |
| 团队管理 | 创建、限制 | 10 |
| 数字员工 | CRUD、激活 | 15 |
| Mattermost | API 调用 | 10 |

### 10.2 集成测试

- 用户注册流程
- 数字员工创建流程
- 套餐升级流程
- 消息流转

### 10.3 E2E 测试

- 完整注册流程
- 添加数字员工
- 群聊协作

---

## 十一、MVP 开发阶段

### Phase 0: 准备 (1天)

- [x] 创建项目仓库
- [x] 配置开发环境
- [ ] 验证 Mattermost API
- [ ] 验证 OpenClaw 配置

### Phase 1: 核心功能 (2周)

**Week 1: 用户和团队**
- [ ] 用户注册/登录 API
- [ ] 团队创建 API
- [ ] Mattermost 集成

**Week 2: 数字员工**
- [ ] 数字员工 CRUD
- [ ] 配置推送
- [ ] 集成测试

### Phase 2: 用户体验 (1周)

- [ ] 注册页面
- [ ] 管理后台
- [ ] E2E 测试

### Phase 3: 稳定性 (1周)

- [ ] 错误处理
- [ ] 重试机制
- [ ] 健康检查
- [ ] 监控指标

### Phase 4: Mattermost 插件 (可选, 1周)

- [ ] 插件框架
- [ ] 侧边栏面板

---

## 十二、验收标准

| 功能 | 标准 |
|-----|------|
| 用户注册 | ✅ 自动创建 Mattermost 账号和团队 |
| 数字员工创建 | ✅ 自动配置 OpenClaw |
| 消息接收 | ✅ 数字员工接收群聊消息 |
| 消息响应 | ✅ 数字员工响应消息 |
| 团队限制 | ✅ 免费用户只能创建1个团队 |
| 测试覆盖 | ✅ 单元测试覆盖率 > 60% |

---

## 十三、不需要的组件

| 组件 | 原因 |
|-----|------|
| BotChannelForwarder 插件 | 普通用户 token 可以接收群聊消息 |
| 网关服务 | 增加复杂度 |
| Bot 账号 | 使用普通用户账号 |

---

## 十四、备份信息

**备份位置:** `~/.openclaw/workspace/backups/2026-03-12/`

**备份内容:**
- mattermost-channel-forwarder 插件
- mattermost-analysis 设计文档
- 工作记录
- monitor-websocket.ts 修改

---

**最后更新:** 2026-03-12 02:32 GMT+8
