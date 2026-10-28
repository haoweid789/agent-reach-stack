# agent-reach-stack

Agent-Reach 的完整工具栈：**一层协议、一层后端**，一个仓库装好。

```
┌─────────────────────────────────────────────────┐
│  protocol/   谁在调用                              │
│  MCP / A2A / Plugin 服务（TypeScript）             │
│  Claude Code · Cursor · VS Code · LangGraph · CrewAI       │
└────────────────────────┬────────────────────────┘
                         │  spawn agent-reach <channel> <action>
┌────────────────────────▼────────────────────────┐
│  backend/    用什么抓                              │
│  Firecrawl 补丁（Python）                          │
│  web read / search / map  →  jina / exa 回退       │
└─────────────────────────────────────────────────┘
```

两层回答的是不同问题，改的也不是同一份代码：

- **protocol/** 把 Agent-Reach 的 CLI 暴露成 42 个 MCP 工具、42 个 A2A skill，
  并提供插件体系。它不改抓取行为，只负责把调用转成 `agent-reach ...` 子进程。
- **backend/** 给 Agent-Reach 的 `web` 渠道打补丁，把 Firecrawl 插到读取链最前面。
  它不认识 MCP，也不依赖 Node。

两者可以单独使用。合在一个仓库是因为它们必须一起才算"能对外提供服务"——
单独装协议层，读网页仍然是 jina/exa 的老链路；单独装后端层，只有 CLI 能用。

## 合并带来的唯一硬连接：`web_map`

`web map` 是 backend 层新增的动作（站点 URL 发现）。协议层的工具表是静态生成的，
所以只在 backend 加动作，MCP 客户端看不到它。本仓库在 `protocol/packages/sdk/src/channels.ts`
里补了 `map` 定义，`web_map` 才成为第 43 个 MCP 工具。

这是两层之间唯一需要同步的地方，`tests/test_integration.py` 专门验证这条链路。

## 安装

前置：Node 20+（仅协议层需要）、Python 3.9+、已安装 Agent-Reach CLI。

```bash
# 全部装好（协议层会 npm install + tsc build）
python install.py

# 只装后端（不需要 Node）
python install.py --backend-only

# 只装协议层（不碰 agent-reach 的抓取链路）
python install.py --protocol-only

# 用仓库里已构建好的 dist，跳过编译
python install.py --protocol-only --skip-build
```

安装器自动定位 Agent-Reach 实际运行的环境（优先 `uv tool` 目录），不会误改 PATH 上没在用的 Python。

## 配置 Firecrawl

不配置也能用，链路保持 `jina -> exa`，与原版 Agent-Reach 完全一致。

```bash
export FC_API_KEY=fc-xxxxxxxx               # 官方托管
export FC_BASE_URL=http://localhost:3002    # 或自托管
```

也可写入 `~/.agent-reach/firecrawl.json`：`{"base_url": "...", "api_key": "..."}`。

## 验证

```bash
python install.py --status          # 两层状态 + 工具表
python tests/test_integration.py    # 跨层：MCP 调用是否真的打到 Firecrawl
python backend/tests/test_e2e.py    # 后端层：23 项协议与回退断言
```

`test_integration.py` 会启动 MCP 服务、经 stdio 真实调用 `web_map` 和 `web_read`，
断言返回结果标注 `[backend: firecrawl]`。这是唯一能证明两层真连上的测试。

## 目录

```
install.py                    统一安装 / 状态 / 卸载
tests/test_integration.py     跨层集成测试
backend/                      Firecrawl 后端补丁
  agent_reach_firecrawl.py      后端实现、补丁、自愈
  install.py                    安装 / 卸载 / doctor / heal
  check_env.py                  安装前环境自检
  tests/                        mock 与 23 项端到端测试
  tools/rewrite_launcher.py     重写 zipapp 启动器
protocol/                     MCP / A2A / Plugin 服务
  src/                          MCP server、A2A server、plugin CLI
  packages/sdk/                 共享渠道定义（web_map 在此声明）
  packages/{langgraph,crewai,autogen}/   框架适配器
  python/agent_reach_sdk/       Python SDK
```

各层细节见 `backend/README.md` 与 `protocol/README.md`。

## 合并时修掉的两个协议层缺陷

这两个问题在原 `agent-reach-mcp` 里就存在，因为 `web_map` 才暴露出来：

**可选参数用位置传递会被静默忽略。** 原 `cli-wrapper.ts` 把所有参数按位置拼接，
但 CLI 的可选参数必须写成 `--limit 5`。位置形式下 `limit` 不生效（静默回落到默认值），
多出来的值还可能让解析失败。现在必填参数走位置、可选参数走标志。

**结果里看不出用了哪个后端。** `formatToolResult` 只渲染标题、URL、正文，
`backend` 字段被丢弃。现在输出首行是 `[backend: firecrawl]`，
排查"同一个页面两次结果不同"时能立刻区分抓取来源。

## 已知边界

- 托管服务无密钥时只有 keyless 额度，`map` / `crawl` 需要配 key。
- 协议层的 `web` 后端枚举已更正为 `firecrawl / jina / exa`（原来是错误的 `browser`）。
- backend 层依赖 distlib zipapp 布局；上游换打包方式时 `python backend/install.py --doctor`
  会报 STALE，`.pth` 仍覆盖 `python -m` 入口。
- `agent-reach update` 会冲掉 backend 补丁，模块加载时会自动重打；协议层不受影响。

## 许可

MIT。Agent-Reach 本身见 [Panniantong/Agent-Reach](https://github.com/Panniantong/Agent-Reach)。
