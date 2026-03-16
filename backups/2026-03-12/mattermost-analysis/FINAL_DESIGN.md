# 数字员工协作平台 - 最终设计文档

**日期:** 2026-03-12  
**版本:** v3.0 (最终版)

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
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                              用户端                                    │
│  ┌───────────────────────────────────────────────────────────────────────────────────────────────────────┐
│  │  Mattermost Web/App/Desktop                                  │
│  │  - 用户直接使用 Mattermost 客户端                                │
│  │  - 数字员工显示为普通用户（有意义的名字）                            │
│  │  - 用户知道这是 AI，不是真人                                │
│  └───────────────────────────────────────────────────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ WebSocket + REST API
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                            Mattermost 服务器                              │
│  - 标准部署                                                 │
│  - 用户管理、团队管理、频道管理                            │
│  - 消息推送、存储                                    │
│  - **不需要任何插件**                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                    │
                          WebSocket + REST API
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        ▼                           ▼                           ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  OpenClaw (员工1)  │    │  OpenClaw (员工2)  │    │  OpenClaw (员工3)  │
│                │    │                │    │                │
│  - 用户 token   │    │  - 用户 token   │    │  - 用户 token   │
│  - WebSocket 连接 │    │  - WebSocket 连接 │    │  - WebSocket 连接 │
│  - 接收群聊消息   │    │  - 接收群聊消息   │    │  - 接收群聊消息   │
│  - 发送响应      │    │  - 发送响应      │    │  - 发送响应      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
        │                           │                           │
        └───────────────────────────┼───────────────────────────┘
                                    │
                                    │ 配置管理
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                            平台管理服务                                        │
│  - 用户注册                                              │
│  - 数字员工创建/管理                                     │
│  - Mattermost 账号自动管理                               │
│  - 配置存储 (PostgreSQL)                                 │
│  - 配置推送 (Shell 脚本 + SIGUSR1)                       │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 三、数字员工创建流程

### 3.1 用户操作

```
用户点击"添加数字员工" → 输入名称"小助手" → 选择类型"助手" → 点击创建
```

### 3.2 稡式流程

```
平台服务                Mattermost API              OpenClaw
    │                       │                    │
    │  1. 创建用户             │                    │
    │ ──────────────────────>│                    │
    │   POST /api/v4/users    │                    │
    │   {username: ai_xxx,       │                    │
    │    email: ai_xxx@internal,│                    │
    │    password: random}   │                    │
    │                       │                    │
    │  2. 返回 user_id         │                    │
    │ <─────────────────────│                    │
    │                       │                    │
    │  3. 生成 token             │                    │
    │ ──────────────────────>│                    │
    │   POST /api/v4/users/{id}/tokens                 │
    │                       │                    │
    │  4. 返回 token             │                    │
    │ <─────────────────────│                    │
    │                       │                    │
    │  5. 加入团队             │                    │
    │ ──────────────────────>│                    │
    │   POST /api/v4/teams/{id}/members               │
    │                       │                    │
    │  6. 返回成功               │                    │
    │ <─────────────────────│                    │
    │                       │                    │
    │  7. 更新 OpenClaw 配置      │                    │
    │ ────────────────────────────────────────────────>│
    │   编辑 openclaw.json           │                    │
    │   发送 SIGUSR1 信号          │                    │
    │                       │                    │
    │                       │  8. 重新加载配置      │
    │                       │  9. 连接 Mattermost    │
    │                       │  10. 开始工作         │
    │ <───────────────────────────────────────────────│
    │                       │                    │
    │  8. 返回成功             │                    │
    │ <─────────────────────│                    │
    │                       │                    │
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
          "botToken": "pbdu3bb87frtug96fiwoaek1rr",
          "requireMention": false,
          "dmPolicy": "open",
          "allowFrom": ["*"]
        }
      }
    }
  }
}
```

**注意：**
- `botToken` 字段名虽然叫 "bot"，但实际上可以是是任何有效 token
- 配置值是**用户 token**（不是 Bot token）
- `requireMention: false` - 在群聊中不需要 @提及
- `dmPolicy: "open" - 接受所有私聊

---

## 五、OpenClaw 修改

### 5.1 鋈子名称修复

**不需要修改！** `botToken` 只是配置项名称，实际上接受任何 token。

### 5.2 已添加的事件支持

**已修复：** 在 `monitor-websocket.ts` 中已添加对 `custom_*` 事件的支持：

```typescript
// 已添加
const isBotChannelMessage =
  payload.event === "bot_channel_message" ||
  payload.event.startsWith("custom_com.openclaw.bot-channel-forwarder_bot_channel_message");
```

---

## 六、Token 配置与激活流程（详细）

### 6.1 整体流程

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                    数字员工 Token 配置与激活流程                                              │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

管理端                    用户                       OpenClaw
    │                        │                           │
    │  1. 创建数字员工         │                           │
    │   - 生成 worker_id      │                           │
    │   - 生成 token          │                           │
    │   - 存储到数据库        │                           │
    │                        │                           │
    │  2. 生成配置命令         │                           │
    │   /mattermost-add      │                           │
    │   worker-001 xxx       │                           │
    │                        │                           │
    │  3. 展示命令给用户       │                           │
    │ ───────────────────────>│                           │
    │                        │                           │
    │                        │  4. 复制命令              │
    │                        │   发送给 OpenClaw          │
    │                        │ ─────────────────────────>│
    │                        │                           │
    │                        │                           │  5. 执行配置命令
    │                        │                           │  6. 写入 openclaw.json
    │                        │                           │  7. 发送 SIGUSR1 信号
    │                        │                           │  8. OpenClaw 重新加载
    │                        │                           │  9. 连接 Mattermost
    │                        │                           │
    │                        │  10. 返回"配置成功"         │
    │                        │ <─────────────────────────│
    │                        │                           │
    │  11. 确认激活成功        │                           │
    │ <──────────────────────│                           │
    │                        │                           │
```

### 6.2 管理端：创建数字员工并生成命令

```typescript
// 平台管理服务 API
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
  "mattermost_user_id": "abc123",
  "mattermost_username": "ai_xyz123",
  "status": "pending",  // 待激活
  "activation_command": "/mattermost-add worker-001 小助手 pbdu3bb87frtug96fiwoaek1rr"
}
```

### 6.3 管理端展示给用户

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                    数字员工创建成功                                                  │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                                              │
│  数字员工 "小助手" 已创建！                                                                                           │
│                                                                                                                              │
│  请复制以下命令发送给 OpenClaw 完成激活：                                                                         │
│                                                                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │  /mattermost-add worker-001 小助手 pbdu3bb87frtug96fiwoaek1rr                                                      │ │
│  └───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                                                              │
│  [复制命令]                                                                                                            │
│                                                                                                                              │
│  或者手动配置：                                                                                                       │
│  1. 编辑 ~/.openclaw/openclaw.json                                                                                          │
│  2. 添加以下内容到 channels.mattermost.accounts                                                                            │
│  3. 重启 OpenClaw                                                                                                            │
│                                                                                                                              │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 6.4 OpenClaw 执行命令

**用户发送：**
```
/mattermost-add worker-001 小助手 pbdu3bb87frtug96fiwoaek1rr
```

**OpenClaw 执行：**
```bash
#!/bin/bash
# add-mattermost-worker.sh

WORKER_ID=$1
NAME=$2
TOKEN=$3
CONFIG_FILE="${OPENCLAW_CONFIG:-~/.openclaw/openclaw.json}"
PID_FILE="${OPENCLAW_PID:-~/.openclaw/gateway.pid}"

# 检查参数
if [ -z "$WORKER_ID" ] || [ -z "$NAME" ] || [ -z "$TOKEN" ]; then
  echo "用法: /mattermost-add <worker_id> <name> <token>"
  exit 1
fi

# 备份配置
cp "$CONFIG_FILE" "${CONFIG_FILE}.bak"

# 使用 jq 添加账号
jq --arg id "$WORKER_ID" \
   --arg name "$NAME" \
   --arg token "$TOKEN" \
   '.channels.mattermost.accounts[$id] = {
     name: $name,
     botToken: $token,
     requireMention: false,
     dmPolicy: "open",
     allowFrom: ["*"]
   }' "$CONFIG_FILE" > "${CONFIG_FILE}.tmp"

mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"

# 发送 SIGUSR1 信号
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  kill -SIGUSR1 "$PID"
  echo "数字员工 \"$NAME\" 配置成功！正在连接 Mattermost..."
else
  echo "配置已保存，请手动重启 OpenClaw"
fi
```

### 6.5 OpenClaw Skill 实现（可选）

```markdown
# mattermost-worker-skill

## 用法

用户说：添加数字员工 worker-001 名字是小助手 token 是 pbdu3bb87frtug96fiwoaek1rr

## 命令

/mattermost-add <worker_id> <name> <token>

## 实现

1. 验证参数
2. 执行 add-mattermost-worker.sh 脚本
3. 返回结果给用户
```

### 6.6 激活状态确认

```typescript
// 平台管理服务轮询检查
async function checkWorkerActivation(workerId: string): Promise<boolean> {
  // 方法 1: 检查 OpenClaw 配置
  const config = await readOpenClawConfig();
  if (config.channels?.mattermost?.accounts?.[workerId]) {
    return true;
  }
  
  // 方法 2: 检查 Mattermost 连接状态
  // OpenClaw 可以通过 API 报告连接状态
  
  return false;
}
```

### 6.7 完整示例

**步骤 1: 用户在管理端创建数字员工**
```
POST /api/workers
{
  "name": "小助手",
  "type": "assistant"
}

Response:
{
  "id": "worker-001",
  "activation_command": "/mattermost-add worker-001 小助手 pbdu3bb87frtug96fiwoaek1rr"
}
```

**步骤 2: 用户复制命令发送给 OpenClaw**
```
用户: /mattermost-add worker-001 小助手 pbdu3bb87frtug96fiwoaek1rr

OpenClaw: 正在配置数字员工 "小助手"...
          配置已写入 ~/.openclaw/openclaw.json
          正在重新加载配置...
          数字员工 "小助手" 已激活！正在连接 Mattermost...
          连接成功！小助手 现在可以接收消息了。
```

**步骤 3: 管理端确认激活**
```
GET /api/workers/worker-001/status

Response:
{
  "id": "worker-001",
  "name": "小助手",
  "status": "active",  // 已激活
  "connected": true,
  "last_active": "2026-03-12T02:10:00Z"
}
```

---

## 七、配置推送技术方案

### 方案 A: Shell 脚本 + SIGUSR1 (推荐)

**优点：**
- ✅ 简单可靠
- ✅ 无需修改 OpenClaw 核心
- ✅ 用户可以通过命令或脚本激活

**实现细节:**
- 管理端生成配置命令
- OpenClaw 执行脚本读取、合并、写入配置
- 发送 `SIGUSR1` 信号重启加载

### 方案 B: OpenClaw 内置命令（未来）

```
/channel add mattermost worker-001 --name "小助手" --token "xxx"
/channel list mattermost
/channel remove mattermost worker-001
/channel reload
```

**优点：**
- ✅ 用户体验最好
- ✅ 原生支持
- ✅ 参数验证

**缺点：**
- ❌ 需要修改 OpenClaw 核心

---

## 七、数据模型

### tenants 表
```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  mattermost_team_id VARCHAR(50),
  created_at TIMESTAMP DEFAULT now()
);
```

### workers 表
```sql
CREATE TABLE workers (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  name VARCHAR(255) NOT null,
  type VARCHAR(50) DEFAULT 'assistant',
  mattermost_user_id VARCHAR(50),
  mattermost_username VARCHAR(100),
  mattermost_token TEXT,  -- 加密存储
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT now()
);
```

---

## 八、团队数量限制（软性约束）

### 8.1 Mattermost 配置

**禁用普通用户创建团队：**

```json
// Mattermost config.json
{
  "ServiceSettings": {
    "EnableTeamCreation": false,    // 禁用用户创建团队
    "EnableUserCreation": true,     // 允许用户注册
    "EnableOpenServer": true        // 允许开放注册
  },
  "TeamSettings": {
    "EnableTeamCreation": false,    // 团队设置中也禁用
    "EnableUserCreation": true
  }
}
```

**效果：**
- 用户无法在 Mattermost 界面中创建团队
- 团队创建只能通过**平台管理服务**（使用管理员 API）

### 8.2 平台服务软性约束

```typescript
// platform-config.yaml
teamLimit:
  enabled: true                    # 是否启用限制
  enforceInMattermost: false       # 是否在 Mattermost 层面强制（默认 false，仅平台服务检查）
  planLimits:
    free: 1                        # 免费版：1个团队
    pro: 5                         # 专业版：5个团队
    enterprise: -1                 # 企业版：无限制

// 业务逻辑
class TeamService {
  async canCreateTeam(userId: string): Promise<{ canCreate: boolean, reason?: string }> {
    const config = await this.getConfig();
    const user = await this.getUser(userId);
    
    // 如果限制未启用，直接允许
    if (!config.teamLimit.enabled) {
      return { canCreate: true };
    }
    
    // 获取用户当前团队数量
    const teamCount = await this.db.teams.count({ owner_id: userId });
    
    // 获取用户套餐的限制
    const maxTeams = config.teamLimit.planLimits[user.plan] || 1;
    
    // -1 表示无限制
    if (maxTeams === -1) {
      return { canCreate: true };
    }
    
    if (teamCount >= maxTeams) {
      return { 
        canCreate: false, 
        reason: `您的套餐(${user.plan})最多允许创建 ${maxTeams} 个团队`,
        upgradeHint: user.plan === 'free' ? '升级到专业版可创建更多团队' : undefined,
      };
    }
    
    return { canCreate: true };
  }
  
  async createTeam(userId: string, data: CreateTeamDTO) {
    // 1. 检查是否可以创建
    const check = await this.canCreateTeam(userId);
    
    if (!check.canCreate) {
      throw new TeamLimitError(check.reason, check.upgradeHint);
    }
    
    // 2. 使用管理员 token 在 Mattermost 创建团队
    const mmTeam = await this.mattermost.createTeam({
      name: data.name,
      display_name: data.displayName,
      type: 'O',
    }, this.adminToken);
    
    // 3. 记录到数据库
    const team = await this.db.teams.create({
      id: generateUUID(),
      owner_id: userId,
      mattermost_team_id: mmTeam.id,
      name: data.displayName,
    });
    
    return team;
  }
}
```

### 8.3 数据库设计

```sql
-- 用户表
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    mattermost_user_id VARCHAR(50),
    plan VARCHAR(20) DEFAULT 'free',  -- free, pro, enterprise
    created_at TIMESTAMP DEFAULT NOW()
);

-- 团队表（无硬性 UNIQUE 约束，由业务逻辑控制）
CREATE TABLE teams (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES users(id),
    mattermost_team_id VARCHAR(50) UNIQUE,
    name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 索引优化查询
CREATE INDEX idx_teams_owner ON teams(owner_id);
```

### 8.4 套餐升级流程

```
免费版用户升级到专业版：
1. 用户支付/升级
2. 平台服务更新 user.plan = 'pro'
3. 用户立即获得创建更多团队的能力
4. 无需修改 Mattermost 配置
```

### 8.5 安全考虑

| 层面 | 措施 |
|-----|------|
| Mattermost 层 | `EnableTeamCreation: false` 禁用界面创建 |
| 平台服务层 | 套餐限制检查 |
| 数据库层 | 业务逻辑控制，无硬性约束 |

---

## 九、不需要的组件

| 组件 | 原因 |
|-----|------|
| BotChannelForwarder 插件 | 普通用户 token 可以接收群聊消息 |
| 网关服务 | 增加、复杂度，| Bot 账号 | 使用普通用户账号代替 |

---

## 九、开发计划

### 鎖表 1: 平台管理服务 (2周)
- 用户注册/登录
- 数字员工 CRUD API
- Mattermost API 集成
- 配置推送脚本

### 链表 2: Mattermost 插件 (1周)
- 数字员工管理面板 (UI)
- 侧边栏集成

### 链表 3: 用户界面 (2周)
- 注册页面
- 管理后台
- 娡板页面

---

## 十、验证清单

### 已验证
- [x] 普通用户 token 可以接收群聊 `posted` 事件
- [x] OpenClaw 使用用户 token 正常工作
- [x] 配置热加载 + 信号重启机制正常工作

### 待验证
- [ ] 多数字员工并发测试
- [ ] 配置持久化和恢复测试
- [ ] 错误处理和重试机制

---

## 十、生成文件

| 文件 | 说明 |
|-----|------|
| `FINAL_Design.md` | 本设计文档 |
| `digital-worker-gateway/` | 庺准代码目录 (已创建) |
| `add-mattermost-worker.sh` | 添加数字员工脚本 |

---

**时间: 02:07**

已保存设计文档。准备回答你的问题。