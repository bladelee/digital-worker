# 数字员工协作平台 - 设计文档 v4.0

**日期:** 2026-03-12
**版本:** v4.0 (Phase 2 重新规划)

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
│  │  - 通过「数字员工」插件管理数字员工                             │ │
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
│  - **数字员工插件** (Phase 2 新增)                                   │
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
│  │ - MM认证    │ │ - 创建      │ │ - 创建/删除                 │  │
│  │ - 自动关联  │ │ - 限制检查  │ │ - 激活/停用                 │  │
│  │             │ │ - 成员管理  │ │ - 配置推送                  │  │
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

## 三、认证方案

### 3.1 认证流程

```
用户在 Mattermost 登录
        │
        ▼
点击「数字员工」插件
        │
        ▼
插件获取当前用户信息（MM 内置 API）
        │
        ▼
插件调用平台 API（带 Mattermost token）
        │
        ▼
平台服务验证 Mattermost token → 获取/创建平台用户
        │
        ▼
返回数字员工数据
```

### 3.2 用户首次使用

```
1. 用户在 Mattermost 登录
2. 点击「数字员工」插件
3. 插件调用 GET /api/v4/users/me 获取用户信息
4. 插件调用 POST /api/auth/mattermost（带 token）
5. 平台服务：
   - 验证 token 有效性
   - 查找 mattermost_user_id 是否已关联
   - 如未关联，自动创建平台用户并关联
6. 返回用户信息 + 数字员工列表
```

### 3.3 平台用户新增字段

```sql
-- users 表新增字段
ALTER TABLE users ADD COLUMN mattermost_user_id VARCHAR(50) UNIQUE;
-- 移除 password_hash（不再需要密码登录）
-- email 可以为空（从 Mattermost 获取）
```

---

## 四、数字员工创建流程

### 4.1 用户操作

```
用户在 Mattermost 侧边栏点击「数字员工」
    → 点击「创建数字员工」
    → 输入名称「小助手」
    → 选择类型「助手」
    → 点击创建
    → 数字员工自动加入当前团队
```

### 4.2 系统流程

```
插件                    平台服务              Mattermost API         OpenClaw
 │                         │                       │                    │
 │  1. 创建请求            │                       │                    │
 │ ───────────────────────>│                       │                    │
 │  (带 MM token)          │                       │                    │
 │                         │                       │                    │
 │                         │  2. 验证 token        │                    │
 │                         │ ─────────────────────>│                    │
 │                         │                       │                    │
 │                         │  3. 返回用户信息      │                    │
 │                         │ <─────────────────────│                    │
 │                         │                       │                    │
 │                         │  4. 创建数字员工账号  │                    │
 │                         │ ─────────────────────>│                    │
 │                         │                       │                    │
 │                         │  5. 返回 user_id      │                    │
 │                         │ <─────────────────────│                    │
 │                         │                       │                    │
 │                         │  6. 生成 token        │                    │
 │                         │ ─────────────────────>│                    │
 │                         │                       │                    │
 │                         │  7. 返回 token        │                    │
 │                         │ <─────────────────────│                    │
 │                         │                       │                    │
 │                         │  8. 加入团队          │                    │
 │                         │ ─────────────────────>│                    │
 │                         │                       │                    │
 │                         │  9. 推送配置          │                    │
 │                         │ ──────────────────────────────────────────>│
 │                         │                       │                    │
 │  10. 返回创建结果       │                       │                    │
 │ <───────────────────────│                       │                    │
 │                         │                       │                    │
```

---

## 五、API 设计

### 5.1 Mattermost 认证

```typescript
// 通过 Mattermost token 登录/注册
POST /api/auth/mattermost
Headers: Authorization: Bearer <mattermost_token>

Response:
{
  "userId": "平台用户ID",
  "mattermostUserId": "xxx",
  "email": "user@example.com",
  "name": "用户名",
  "plan": "free",
  "isNewUser": true/false
}
```

### 5.2 数字员工 CRUD

```typescript
// 创建数字员工
POST /api/workers
Headers: Authorization: Bearer <mattermost_token>
Body:
{
  "teamId": "团队ID",
  "name": "小助手",
  "type": "assistant"
}

Response:
{
  "id": "worker-001",
  "name": "小助手",
  "type": "assistant",
  "status": "pending",
  "mattermostUserId": "xxx",
  "createdAt": "2026-03-12T00:00:00Z"
}

// 激活数字员工
POST /api/workers/:id/activate

// 获取数字员工列表
GET /api/workers?teamId=xxx

// 获取单个数字员工
GET /api/workers/:id

// 删除数字员工
DELETE /api/workers/:id
```

### 5.3 一键拉群

```typescript
// 创建频道并添加数字员工
POST /api/workers/:id/create-channel
Body:
{
  "channelName": "项目讨论组",
  "channelDisplayName": "项目讨论组",
  "memberUserIds": ["user1", "user2"]  // 可选，其他成员
}

Response:
{
  "channelId": "xxx",
  "channelName": "项目讨论组",
  "workerAdded": true
}
```

---

## 六、Mattermost 插件设计

### 6.1 功能清单

| 功能 | 说明 |
|------|------|
| **侧边栏入口** | 显示「数字员工」图标 |
| **员工列表** | 显示当前团队的数字员工 |
| **创建员工** | 表单：名称、类型 |
| **激活/停用** | 一键切换状态 |
| **一键拉群** | 创建频道 + 添加员工 |
| **状态显示** | 在线/离线/错误 |

### 6.2 技术栈

- **前端**: React + TypeScript（与 Mattermost 一致）
- **后端**: Go（Mattermost 插件要求）
- **通信**: 通过 Mattermost API 调用平台服务

### 6.3 插件结构

```
mm-plugin-digital-worker/
├── plugin.json           # 插件配置
├── go.mod                # Go 依赖
├── main.go               # 插件入口
├── server/               # 服务端代码
│   ├── configuration.go  # 配置
│   └── plugin.go         # 插件逻辑
├── webapp/               # 前端代码
│   ├── src/
│   │   ├── index.tsx     # 入口
│   │   ├── components/   # 组件
│   │   │   ├── Sidebar.tsx
│   │   │   ├── WorkerList.tsx
│   │   │   ├── CreateWorker.tsx
│   │   │   └── WorkerCard.tsx
│   │   └── actions/      # API 调用
│   │       └── worker.ts
│   ├── package.json
│   └── tsconfig.json
└── build/                # 构建输出
```

### 6.4 插件配置

```json
{
  "id": "com.openclaw.digital-worker",
  "name": "数字员工",
  "description": "管理数字员工助手",
  "version": "1.0.0",
  "min_server_version": "7.0.0",
  "server": {
    "executables": {
      "linux-amd64": "server/dist/plugin-linux-amd64",
      "darwin-amd64": "server/dist/plugin-darwin-amd64",
      "windows-amd64": "server/dist/plugin-windows-amd64.exe"
    }
  },
  "webapp": {
    "bundle_path": "webapp/dist/main.js"
  },
  "settings_schema": {
    "settings": [
      {
        "key": "PlatformAPIUrl",
        "display_name": "平台 API 地址",
        "type": "text",
        "default": "http://localhost:3000"
      }
    ]
  }
}
```

---

## 七、数据模型

### 7.1 用户表

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255),
    name VARCHAR(255),
    mattermost_user_id VARCHAR(50) UNIQUE NOT NULL,
    plan VARCHAR(20) DEFAULT 'free',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_users_mm_id ON users(mattermost_user_id);
```

### 7.2 团队表

```sql
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES users(id),
    mattermost_team_id VARCHAR(50) UNIQUE,
    name VARCHAR(255),
    display_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### 7.3 数字员工表

```sql
CREATE TABLE workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES users(id),
    team_id UUID REFERENCES teams(id),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) DEFAULT 'assistant',
    mattermost_user_id VARCHAR(50),
    mattermost_token TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_workers_team_id ON workers(team_id);
CREATE INDEX idx_workers_tenant_id ON workers(tenant_id);
```

---

## 八、错误处理

### 8.1 错误码

```typescript
enum ErrorCode {
  // 认证相关
  INVALID_MATTERMOST_TOKEN = 'INVALID_MATTERMOST_TOKEN',
  MATTERMOST_AUTH_FAILED = 'MATTERMOST_AUTH_FAILED',
  
  // 用户相关
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  
  // 团队相关
  TEAM_LIMIT_EXCEEDED = 'TEAM_LIMIT_EXCEEDED',
  TEAM_NOT_FOUND = 'TEAM_NOT_FOUND',
  
  // 数字员工相关
  WORKER_LIMIT_EXCEEDED = 'WORKER_LIMIT_EXCEEDED',
  WORKER_NOT_FOUND = 'WORKER_NOT_FOUND',
  WORKER_ACTIVATION_FAILED = 'WORKER_ACTIVATION_FAILED',
  
  // Mattermost 相关
  MATTERMOST_UNAVAILABLE = 'MATTERMOST_UNAVAILABLE',
  MATTERMOST_API_ERROR = 'MATTERMOST_API_ERROR',
  
  // OpenClaw 相关
  CONFIG_PUSH_FAILED = 'CONFIG_PUSH_FAILED',
}
```

### 8.2 错误响应格式

```typescript
interface ErrorResponse {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  details?: any;
}
```

---

## 九、开发阶段

### Phase 0: 准备 ✅ (已完成)

- [x] 创建项目仓库
- [x] 配置开发环境
- [x] 数据库设计
- [x] 基础服务架构

### Phase 1: 后端核心 API ✅ (已完成)

- [x] 用户管理 API
- [x] 团队管理 API
- [x] 数字员工 CRUD API
- [x] Mattermost 集成
- [x] OpenClaw 配置推送
- [x] 健康检查 API
- [x] 单元测试

### Phase 2: Mattermost 插件 + MM 认证 (当前)

#### 2.1 后端：Mattermost 认证

- [ ] `/api/auth/mattermost` 路由
- [ ] `MattermostAuthService` 服务
- [ ] 验证 MM token
- [ ] 根据 MM user_id 自动创建/关联平台用户
- [ ] 一键拉群 API

#### 2.2 Mattermost 插件

- [ ] 创建插件项目结构
- [ ] 插件配置（platformApiUrl）
- [ ] 侧边栏组件
- [ ] 数字员工列表组件
- [ ] 创建数字员工表单
- [ ] 激活/停用操作
- [ ] 一键拉群功能
- [ ] 打包部署

### Phase 3: 稳定性 ✅ (已完成)

- [x] 错误处理完善
- [x] 重试机制（Mattermost API）
- [x] Prometheus 指标
- [x] 结构化日志
- [x] 性能优化

### Phase 4: 独立管理后台（可选）

- [ ] React 前端项目
- [ ] 用户注册页面
- [ ] 管理后台 UI
- [ ] E2E 测试

### Phase 5: 认证中心整合

- [ ] 统一认证中心 SSO
- [ ] Mattermost OAuth 配置
- [ ] 所有应用单点登录

---

## 十、验收标准

| 功能 | 标准 |
|-----|------|
| Mattermost 登录 | ✅ 用户在 MM 登录后，插件自动识别 |
| 数字员工创建 | ✅ 在插件中创建，自动配置 OpenClaw |
| 数字员工激活 | ✅ 一键激活，立即可用 |
| 一键拉群 | ✅ 创建频道并添加数字员工 |
| 群聊响应 | ✅ 数字员工接收并响应消息 |
| 团队限制 | ✅ 免费用户只能创建1个团队 |
| 测试覆盖 | ✅ 单元测试覆盖率 > 60% |

---

## 十一、部署方案

### 11.1 Docker Compose

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: digital_workers
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  platform-api:
    build: ./digital-worker-platform
    environment:
      DATABASE_URL: postgresql://postgres:password@postgres:5432/digital_workers
      MATTERMOST_URL: http://mattermost:8065
      MATTERMOST_ADMIN_TOKEN: ${MATTERMOST_ADMIN_TOKEN}
    ports:
      - "3000:3000"
    depends_on:
      - postgres

  mattermost:
    image: mattermost/mattermost-team-edition:latest
    ports:
      - "8065:8065"
    volumes:
      - mattermost_data:/mattermost/data
      - ./mm-plugin-digital-worker:/mattermost/plugins/digital-worker

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./certs:/etc/nginx/certs
    depends_on:
      - platform-api
      - mattermost

volumes:
  postgres_data:
  mattermost_data:
```

### 11.2 Nginx 配置

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    location /api/ {
        proxy_pass http://platform-api:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        proxy_pass http://mattermost:8065;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## 十二、备份信息

**备份位置:** `~/.openclaw/workspace/backups/2026-03-12/`

**相关文档:**
- v3.1 设计文档: `FINAL_DESIGN.md`
- Mattermost 分析: `mattermost-analysis/`

---

**最后更新:** 2026-03-12 08:15 GMT+8
