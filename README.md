# HUHA

HUHA 是一套轻量化的服务器探针系统，包含：

- `control-server`: Node.js 主控服务
- `probe-go`: Go 探针
- `web-console`: React + shadcn/ui 风格前端控制台
- `mongodb`: 指标与状态存储

当前仓库已经完成第一批可运行骨架，并支持 Docker 部署。

## 当前能力

- `control-server` 支持 HTTP 健康检查
- `control-server` 支持探针 WebSocket 接入：`/ws/agent`
- `control-server` 支持前端 WebSocket 推送：`/ws/dashboard`
- `control-server` 支持按 agent 查询近实时历史指标：`/api/agents/:agentId/timeseries`
- `control-server` 支持安装脚本下载：`/install/huha.sh`
- `control-server` 支持 PowerShell 安装脚本下载：`/install/huha.ps1`
- `control-server` 支持卸载脚本下载：`/install/huha-uninstall.sh`、`/install/huha-uninstall.ps1`
- Windows PowerShell 安装脚本默认以后台服务方式安装，并带日志落盘与失败自动重启
- `control-server` 支持多平台 probe 二进制下载：`/downloads/probes/*`
- `control-server` 支持单管理员账户、登录会话与受保护接口
- `control-server` 支持首次启动初始化：首次进入控制台时创建管理员
- `control-server` 支持 `agents`、`metrics_latest`、`metrics_timeseries`、`process_snapshots` 的基础落库
- `probe-go` 支持注册、系统信息上报、快指标上报、慢指标上报
- `web-console` 支持初始化管理员、登录、总览卡片、Agent 列表、单机详情和实时曲线
- `docker-compose` 支持一键启动 `mongodb + control-server + web-console`

## 当前开发边界

这一版是“可持续迭代的起点”，不是完整产品。现状如下：

- Linux 采集最完整
- macOS 采集已有基础实现，网络速率仍需继续补强
- Windows 已支持快指标、慢指标和系统信息采集，仍需真实 Windows 环境联调验证
- 告警、历史图表聚合查询接口还未完成

## 仓库结构

```text
.
├─ apps/
│  ├─ control-server/
│  ├─ probe-go/
│  └─ web-console/
├─ packages/
│  └─ protocol/
├─ docker-compose.yml
└─ README.md
```

## 本地开发

### 1. 安装依赖

Node.js 需要 `20+`，Go 需要 `1.22+`。

```bash
pnpm install
cd apps/probe-go && go mod tidy
```

如果当前网络环境访问 GitHub 不稳定，可以使用仓库里的代理配置：

```bash
GIT_CONFIG_GLOBAL=/Volumes/Samsung2T/PJFiles/huha/.gitconfig.proxy GOPROXY=direct GOSUMDB=off go mod tidy
```

### 2. 启动 MongoDB

```bash
docker compose up -d mongodb
```

### 3. 启动主控

```bash
pnpm dev:control-server
```

默认端口：

- HTTP: `http://localhost:4000`
- Agent WS: `ws://localhost:4000/ws/agent`
- Dashboard WS: `ws://localhost:4000/ws/dashboard`

### 4. 启动前端

```bash
pnpm dev:web-console
```

默认地址：

- `http://localhost:5173`

### 5. 启动探针

```bash
cd apps/probe-go
HUHA_SERVER_URL=ws://localhost:4000/ws/agent go run ./cmd/probe
```

## Docker 部署

当前 Docker 编排包含：

- `mongodb`
- `control-server`
- `web-console`

启动：

```bash
docker compose up --build
```

访问地址：

- 前端：`http://localhost:4173`
- 主控：`http://localhost:4000`
- MongoDB：`mongodb://localhost:27017`

首次启动说明：

- 第一次打开控制台时，会先进入初始化页面
- 需要先创建唯一管理员账户，之后才能进入主机控制台
- 初始化完成后，`/api/agents`、`/api/agents/:agentId`、`/api/installers`、`/ws/dashboard` 等接口都要求管理员会话

说明：

- `probe-go` 没有默认加入 `docker-compose.yml`
- 原因是探针通常应该运行在宿主机而不是容器里，才能采集真实主机指标
- 如果只做链路联调，可以单独构建 `apps/probe-go/Dockerfile`

## 环境变量

根目录提供了示例文件：[.env.example](/Volumes/Samsung2T/PJFiles/huha/.env.example)

核心变量：

- `HUHA_HTTP_PORT`
- `HUHA_HTTP_HOST`
- `HUHA_MONGODB_URI`
- `HUHA_MONGODB_DB`
- `HUHA_ADMIN_SESSION_TTL_HOURS`
- `HUHA_AGENT_OFFLINE_AFTER_MS`
- `HUHA_PUBLIC_SERVER_URL`
- `HUHA_PUBLIC_DASHBOARD_WS_URL`
- `HUHA_PROBE_DOWNLOAD_BASE_URL`
- `VITE_HUHA_API_BASE_URL`
- `VITE_HUHA_DASHBOARD_WS_URL`

Probe 变量：

- `HUHA_SERVER_URL`
- `HUHA_AGENT_ID`
- `HUHA_PROBE_VERSION`
- `HUHA_FAST_INTERVAL`
- `HUHA_SLOW_INTERVAL`
- `HUHA_INFO_INTERVAL`
- `HUHA_RECONNECT_WAIT`

## 已实现接口

### HTTP

- `GET /health`
- `GET /api/setup/status`
- `POST /api/setup/admin`
- `POST /api/auth/login`
- `GET /api/auth/session`
- `POST /api/auth/logout`
- `GET /api/agents`
- `GET /api/agents/:agentId`
- `GET /api/agents/:agentId/timeseries`
- `GET /api/ingestion/schema`
- `GET /api/installers`
- `GET /install/huha.sh`
- `GET /install/huha.ps1`
- `GET /install/huha-uninstall.sh`
- `GET /install/huha-uninstall.ps1`
- `GET /downloads/probes/:filename`

### WebSocket

- `/ws/agent`
- `/ws/dashboard`

## 下一步建议

按优先级建议继续做这几件事：

1. 给 `control-server` 增加历史查询 API 和告警模块
2. 给 `probe-go` 补齐 macOS 网络速率和 Windows 慢指标 collector
3. 给前端补告警页和主机筛选
4. 给 Windows collector 补齐慢指标采集
5. 给 dashboard 增加更细的权限模型和消息 schema 校验

## 注意事项

- 当前没有提交锁文件，首次安装会生成 `pnpm-lock.yaml`
- 当前探针消息没有做签名和鉴权
- 当前前端使用的是 shadcn/ui 风格基础组件，而不是完整 CLI 生成物
- 当前 Windows collector 仍是占位实现，不能视为完成
- Docker 部署时，`control-server` 会自动构建 `darwin/linux/windows` 的 `amd64/arm64` probe 产物并通过 `/downloads/probes/*` 提供下载
- 本地非 Docker 开发时，可执行 `pnpm build:probes` 生成多平台 probe 产物
- 当前用户系统是单管理员模型，不支持多用户和角色划分
