# 数字员工协作工具设计方案

**日期:** 2026-03-11  
**目标:** 基于 Mattermost 架构，设计一个面向小微企业/一人公司的数字员工协作平台

---

## 一、需求分析

### 1.1 目标用户

| 用户类型 | 特点 | 需求 |
|---------|------|------|
| 一人公司 | 只有 1 个真人 | 全部由数字员工协助工作 |
| 小微企业 | 2-10 个真人 | 数字员工作为主力，真人做决策 |
| 数字团队 | 0 个真人 | 完全自动化的数字员工协作 |

### 1.2 核心需求

1. **多租户支持**
   - 每个租户 = 一个公司/团队
   - 租户间完全隔离

2. **数字员工快速接入**
   - 一键添加数字员工到群组
   - 支持不同类型的数字员工（客服、销售、开发等）

3. **群组协作**
   - 多个数字员工 + 真人在同一群组
   - 数字员工之间可以协作

4. **OpenClaw 集成**
   - 每个数字员工对应一个 OpenClaw 实例
   - 支持大规模接入

---

## 二、方案对比

### 方案 A: 基于 Mattermost 深度定制

**架构:**

```
┌─────────────────────────────────────────────────────────────┐
│                    Mattermost 核心                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐│
│  │  租户管理   │  │  数字员工   │  │    OpenClaw 连接器   ││
│  │  插件       │  │  管理插件   │  │    插件              ││
│  └─────────────┘  └─────────────┘  └─────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

**优点:**
- 成熟的消息系统
- 完整的权限管理
- 丰富的客户端

**缺点:**
- 需要深度修改核心代码
- 升级困难
- 多租户需要额外开发

**开发难度:** ⭐⭐⭐⭐⭐  
**维护成本:** ⭐⭐⭐⭐⭐  
**推荐度:** ⭐⭐

---

### 方案 B: 基于 Mattermost 插件扩展

**架构:**

```
┌─────────────────────────────────────────────────────────────┐
│                    Mattermost 核心 (不变)                    │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              数字员工协作插件                          │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────┐ │  │
│  │  │租户管理│ │员工管理│ │群组管理│ │OpenClaw连接│ │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────────┘ │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**实现方式:**

1. **租户管理**
   - 每个租户 = 一个 Team
   - 使用 Mattermost 原有的团队隔离

2. **数字员工管理**
   - 数字员工 = Bot 用户
   - 通过插件管理 Bot 的创建和配置

3. **OpenClaw 连接**
   - 每个数字员工连接一个 OpenClaw 实例
   - 通过 WebSocket 或 API 通信

**优点:**
- 不修改核心代码
- 升级兼容性好
- 利用现有功能

**缺点:**
- 功能受限于插件 API
- 多租户隔离不够彻底
- Bot 消息接收有限制（我们遇到的问题）

**开发难度:** ⭐⭐⭐  
**维护成本:** ⭐⭐⭐  
**推荐度:** ⭐⭐⭐

---

### 方案 C: 全新开发 - 参考 Mattermost 架构

**架构:**

```
┌─────────────────────────────────────────────────────────────┐
│                    DigitalWorker Server                      │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐│
│  │   API 层    │  │  WebSocket  │  │    租户管理         ││
│  │   (REST)    │  │   Hub       │  │    (多租户核心)     ││
│  └─────────────┘  └─────────────┘  └─────────────────────┘│
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              数字员工管理器                          │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐               │   │
│  │  │员工注册│ │能力定义│ │任务分配│               │   │
│  │  └─────────┘ └─────────┘ └─────────┘               │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              OpenClaw 集成层                         │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐               │   │
│  │  │连接管理│ │消息路由│ │负载均衡│               │   │
│  │  └─────────┘ └─────────┘ └─────────┘               │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**核心技术栈:**
- Go (参考 Mattermost)
- PostgreSQL
- Redis (缓存和消息队列)
- WebSocket (实时通信)

**优点:**
- 完全针对数字员工场景设计
- 多租户原生支持
- 消息路由优化

**缺点:**
- 开发工作量大
- 需要从零开始
- 缺少成熟客户端

**开发难度:** ⭐⭐⭐⭐⭐  
**维护成本:** ⭐⭐  
**推荐度:** ⭐⭐⭐⭐

---

### 方案 D: 混合方案 - Mattermost + 独立网关

**架构:**

```
┌─────────────────────────────────────────────────────────────┐
│                    独立网关服务                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐│
│  │  租户管理   │  │  数字员工   │  │    OpenClaw 连接池  ││
│  │             │  │  路由       │  │                     ││
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘│
│         │                │                    │           │
│         └────────────────┴────────────────────┘           │
│                          │                                  │
└──────────────────────────┼──────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │ Mattermost  │
                    │   (标准)    │
                    └─────────────┘
```

**工作流程:**

1. 用户在 Mattermost 中发消息
2. 网关服务通过 Mattermost API/Webhook 接收消息
3. 网关根据租户和群组配置，路由到对应的 OpenClaw 实例
4. OpenClaw 处理后，通过网关发回 Mattermost

**优点:**
- Mattermost 保持标准，升级简单
- 网关可以独立扩展
- 多租户在网关层实现

**缺点:**
- 多了一层转发
- 实时性可能受影响
- 需要维护两套系统

**开发难度:** ⭐⭐⭐  
**维护成本:** ⭐⭐⭐⭐  
**推荐度:** ⭐⭐⭐⭐⭐

---

## 三、方案推荐

### 综合评分

| 方案 | 开发难度 | 维护成本 | 灵活性 | 多租户 | 总分 |
|-----|---------|---------|-------|-------|------|
| A: 深度定制 | 1 | 1 | 5 | 3 | 10 |
| B: 插件扩展 | 3 | 3 | 3 | 2 | 11 |
| C: 全新开发 | 1 | 4 | 5 | 5 | 15 |
| D: 混合网关 | 3 | 4 | 4 | 5 | **16** |

### 推荐方案: D (混合网关)

**理由:**

1. **快速落地**
   - Mattermost 保持标准，无需修改
   - 网关可以快速开发

2. **可扩展性**
   - 网关可以独立扩展
   - 支持大规模 OpenClaw 接入

3. **多租户支持**
   - 在网关层实现租户隔离
   - 灵活的租户配置

4. **维护友好**
   - Mattermost 可以独立升级
   - 网关逻辑简单，易于维护

---

## 四、推荐方案详细设计

### 4.1 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      DigitalWorker Gateway                       │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Tenant      │  │  Worker      │  │  OpenClaw Connection │  │
│  │  Manager     │  │  Router      │  │  Pool                │  │
│  │              │  │              │  │                      │  │
│  │ - 租户注册   │  │ - 消息路由   │  │ - 连接管理           │  │
│  │ - 配置管理   │  │ - 负载均衡   │  │ - 心跳检测           │  │
│  │ - 隔离控制   │  │ - 能力匹配   │  │ - 自动重连           │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Message Handler                        │   │
│  │  - 接收 Mattermost Webhook                               │   │
│  │  - 解析租户/群组/员工                                    │   │
│  │  - 路由到目标 OpenClaw                                   │   │
│  │  - 接收 OpenClaw 响应                                    │   │
│  │  - 发送到 Mattermost API                                 │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Data Store                             │   │
│  │  - PostgreSQL (租户/员工配置)                            │   │
│  │  - Redis (消息队列/缓存)                                 │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ WebSocket + REST API
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                      Mattermost Server                           │
│  - 标准部署                                                       │
│  - 配置 Outgoing Webhook                                         │
│  - 创建 Bot 用户                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 数据模型

```sql
-- 租户表
CREATE TABLE tenants (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    plan VARCHAR(50) DEFAULT 'free',
    mattermost_team_id VARCHAR(50),
    config JSONB,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- 数字员工表
CREATE TABLE digital_workers (
    id UUID PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50),  -- 'assistant', 'developer', 'sales', etc.
    capabilities JSONB,  -- 能力标签
    openclaw_endpoint VARCHAR(255),  -- OpenClaw 连接地址
    openclaw_token VARCHAR(255),  -- OpenClaw 认证 token
    mattermost_bot_id VARCHAR(50),  -- Mattermost Bot ID
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- 群组配置表
CREATE TABLE group_configs (
    id UUID PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id),
    mattermost_channel_id VARCHAR(50),
    worker_ids UUID[],  -- 关联的数字员工
    config JSONB,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- 消息日志表
CREATE TABLE message_logs (
    id UUID PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id),
    worker_id UUID REFERENCES digital_workers(id),
    direction VARCHAR(10),  -- 'inbound' or 'outbound'
    mattermost_post_id VARCHAR(50),
    content TEXT,
    processed_at TIMESTAMP,
    created_at TIMESTAMP
);
```

### 4.3 API 设计

```
# 租户管理
POST   /api/v1/tenants                # 创建租户
GET    /api/v1/tenants/:id            # 获取租户
PUT    /api/v1/tenants/:id            # 更新租户
DELETE /api/v1/tenants/:id            # 删除租户

# 数字员工管理
POST   /api/v1/tenants/:id/workers    # 创建数字员工
GET    /api/v1/tenants/:id/workers    # 列出数字员工
PUT    /api/v1/workers/:id            # 更新数字员工
DELETE /api/v1/workers/:id            # 删除数字员工

# 群组管理
POST   /api/v1/tenants/:id/groups     # 创建群组配置
GET    /api/v1/tenants/:id/groups     # 列出群组配置
PUT    /api/v1/groups/:id             # 更新群组配置
DELETE /api/v1/groups/:id             # 删除群组配置

# Webhook 接收
POST   /api/v1/webhook/mattermost     # 接收 Mattermost 消息

# OpenClaw 回调
POST   /api/v1/callback/openclaw/:worker_id  # 接收 OpenClaw 响应
```

### 4.4 消息流程

```
1. 用户在 Mattermost 频道发消息
   │
   ▼
2. Mattermost 触发 Outgoing Webhook
   │
   ▼
3. Gateway 接收 Webhook
   │
   ├── 解析租户 ID (根据 team_id)
   ├── 解析群组 ID (根据 channel_id)
   ├── 查询关联的数字员工
   │
   ▼
4. 路由到 OpenClaw 实例
   │
   ├── 根据负载选择实例
   ├── 发送消息到 OpenClaw WebSocket
   │
   ▼
5. OpenClaw 处理消息
   │
   ├── 调用 LLM
   ├── 生成响应
   ├── 通过回调 API 返回
   │
   ▼
6. Gateway 接收响应
   │
   ├── 通过 Mattermost API 发送消息
   │
   ▼
7. 用户在 Mattermost 看到响应
```

### 4.5 关键技术点

1. **Outgoing Webhook 配置**
   ```json
   {
     "channel_id": "xxx",
     "trigger_words": [""],  // 空数组 = 触发所有消息
     "callback_urls": ["https://gateway.example.com/api/v1/webhook/mattermost"]
   }
   ```

2. **OpenClaw 连接池**
   ```go
   type ConnectionPool struct {
       workers map[string]*OpenClawConn  // worker_id -> connection
       mu      sync.RWMutex
   }
   
   func (p *ConnectionPool) Route(workerID string, msg *Message) error {
       conn := p.Get(workerID)
       if conn == nil {
           return errors.New("worker not connected")
       }
       return conn.Send(msg)
   }
   ```

3. **租户隔离**
   ```go
   func (h *Handler) HandleWebhook(c *gin.Context) {
       teamID := c.PostForm("team_id")
       channelID := c.PostForm("channel_id")
       userID := c.PostForm("user_id")
       text := c.PostForm("text")
       
       // 查找租户
       tenant := h.tenantStore.FindByTeamID(teamID)
       if tenant == nil {
           return
       }
       
       // 查找群组配置
       group := h.groupStore.FindByChannelID(tenant.ID, channelID)
       if group == nil {
           return
       }
       
       // 路由到数字员工
       for _, workerID := range group.WorkerIDs {
           h.router.Route(workerID, &Message{...})
       }
   }
   ```

---

## 五、实施计划

### 阶段 1: MVP (2 周)

- [ ] 网关服务框架搭建
- [ ] 租户管理 API
- [ ] 数字员工管理 API
- [ ] Mattermost Webhook 接收
- [ ] OpenClaw 连接池
- [ ] 基本消息路由

### 阶段 2: 完善 (2 周)

- [ ] 群组配置管理
- [ ] 消息日志记录
- [ ] 管理后台 UI
- [ ] 监控和告警

### 阶段 3: 优化 (2 周)

- [ ] 负载均衡
- [ ] 自动扩缩容
- [ ] 性能优化
- [ ] 文档完善

---

## 六、总结

**推荐采用方案 D (混合网关)**，原因：

1. **快速落地** - Mattermost 保持标准，无需修改
2. **可扩展** - 网关独立扩展，支持大规模接入
3. **多租户** - 网关层实现，灵活配置
4. **维护友好** - 组件解耦，独立升级

**预计开发周期:** 6 周  
**核心技术栈:** Go, PostgreSQL, Redis, WebSocket  
**部署方式:** Docker Compose / Kubernetes
