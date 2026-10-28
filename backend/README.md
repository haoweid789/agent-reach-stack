# agent-reach × Firecrawl

将 [Firecrawl](https://github.com/firecrawl/firecrawl) 接入 [Agent Reach](https://github.com/Panniantong/Agent-Reach) 的 `web` 渠道，作为优先后端，排在 Jina / Exa 之前。

```
web read   : firecrawl -> jina -> exa
web search : firecrawl -> exa
web map    : firecrawl              (新增动作，站点 URL 发现)
```

## 快速开始

前置条件：已安装 `agent-reach`（`agent-reach doctor` 能正常输出），以及 Python 3.9+。

```bash
# 0. 环境自检（推荐先跑，输出不满足的条件）
python check_env.py

# 1. 安装补丁
python install.py

# 2. 配置 Firecrawl（二选一；不配置则行为与原版完全一致）
export FC_API_KEY=fc-xxxxxxxx          # 官方托管服务
export FC_BASE_URL=http://localhost:3002   # 或自托管

# 3. 验证
python install.py --status
agent-reach web read "https://example.com"
```

`--status` 中 `chain` 出现 `firecrawl`、且 `state` 不再是 dormant，即表示生效。

Windows 下把 `export` 换成 `set`（cmd）或 `$env:FC_API_KEY="..."`（PowerShell）。

## 接入动机

Agent Reach 原有的网页读取链由 Jina Reader 与 Exa 组成。两者各有覆盖盲区：Jina Reader 在免费额度下对部分站点返回反爬验证页，Exa 定位为语义搜索，不做整页渲染。Firecrawl 自带 Playwright 渲染与代理池，对 JS 重度渲染的页面和中文站点提取更稳定，因此作为链首后端接入，Jina 与 Exa 保留为回退。

## 兼容性收益

Agent Reach 的 `public_web` 机制（`runtime/public_web.py`）在内部重新构造 `WebChannel()` 并调用 `run_action`。因此任何声明了 `public_web` 作用域的渠道，其公开读取路径都会经过打过补丁的 Web 链。

以 `linkedin read` 为例，当 Firecrawl 拒抓该站点时，调用序列为：

```
attempts: public-web/firecrawl(403) -> public-web/jina -> public-web/exa -> opencli
```

这意味着 Reddit、小红书、LinkedIn、Boss、Twitter、Facebook 等渠道的公开读取路径无需额外适配即可获得 Firecrawl 支持。该链路依赖 URL 匹配，难以构造稳定的 mock 数据，测试中通过劫持调用记录来验证。

## 实现方式

Agent Reach 由 `uv tool` 安装在独立环境中，`agent-reach update` 会整体替换该环境，直接修改 `channels/web.py` 无法在升级后保留。本项目采用两个持久化挂载点：

1. **`agent_reach_firecrawl.pth`** — 放置于 site-packages，由 `site.py` 在解释器启动时执行。覆盖 `python -m agent_reach` 等入口。

2. **启动器改写** — `uv` 生成的 `agent-reach.exe` 是 distlib zipapp，直接执行 `agent_reach.cli:main`，不经由 `site.py` 处理 `.pth`，仅靠挂载点 1 无法生效。安装器会重写其内嵌的 `__main__.py`，在调用 `main()` 前插入导入语句。

两个挂载点均保留备份，`--uninstall` 可完整还原。原有的 Jina / Exa 后端未作改动，继续作为回退链。

## 升级自愈

`agent-reach update` 会同时覆盖 `.pth` 与启动器改写。补丁模块在每次加载时调用一次 `install.heal()`：检测到启动器恢复原状时会立即重新写入。该过程静默执行，异常被吞掉，不影响正常读取。

验证方式：将启动器还原为原始版本后，`--doctor` 返回 1；执行任意一次 `agent-reach` 命令后再检查，返回 0。

## 安装

```bash
python install.py            # 安装补丁（.pth + 启动器改写）
python install.py --status   # 后端链、配置、服务可达性
python install.py --doctor   # 健康状态，退出码 0/1，可脚本化
python install.py --heal     # 强制修复（通常不需要）
python install.py --uninstall
```

安装器会自动定位 `agent-reach` 实际运行的环境，优先识别 `uv tool` 目录，不会修改 PATH 上未被使用的 Python 环境。

## 配置

按以下优先级取第一个命中的配置项：

| 来源 | 项 | 说明 |
|---|---|---|
| 环境变量 | `FC_BASE_URL` / `FIRECRAWL_BASE_URL` | 自托管地址，如 `http://localhost:3002` |
| 环境变量 | `FC_API_KEY` / `FIRECRAWL_API_KEY` | 托管服务密钥；自托管且未启用鉴权时留空 |
| 配置文件 | `~/.agent-reach/firecrawl.json` | `{"base_url": "...", "api_key": "..."}` |

```bash
# 1) 自托管（docker compose，API 监听 3002，默认无鉴权）
export FC_BASE_URL=http://localhost:3002

# 2) 官方托管服务
export FC_API_KEY=fc-xxxxxxxx

# 3) 自托管并启用鉴权
export FC_BASE_URL=http://localhost:3002 FC_API_KEY=your-token
```

未配置时行为与原版完全一致：Firecrawl 不插入后端链，`agent-reach channels` 仅列出原有的 search / read，不出现 map，也不会产生额外的 `NEED_SETUP` 尝试记录。

## 自托管 Firecrawl

```bash
git clone https://github.com/firecrawl/firecrawl
cd firecrawl
cp .env.example .env            # 保持 USE_DB_AUTHENTICATION=false
docker compose up -d
curl -s localhost:3002/v2/scrape -X POST -H 'Content-Type: application/json' \
     -d '{"url":"https://example.com","formats":["markdown"]}' | head -c 200
export FC_BASE_URL=http://localhost:3002
```

自托管需自行承担安全、可用性、容量、升级与数据保留责任。API 若需跨出内网，应先补充鉴权、TLS 终止与网络策略——默认配置不带鉴权。

## 错误分级

| 情况 | 行为 |
|---|---|
| 正常 | `backend: firecrawl`，仅尝试一次，直接返回结果 |
| Firecrawl 5xx / 不可达 | `UPSTREAM_BROKEN`，继续尝试 jina → exa |
| Firecrawl 拒抓该站点（403 / 451） | `UPSTREAM_BROKEN`，继续尝试回退链 |
| 400 / 非法 URL | `BAD_INPUT`，终止链，不再继续后续请求 |
| 401 密钥错误 | `BAD_INPUT` + `Check FC_API_KEY`，终止 |
| 402 / 429 | `RATE_LIMITED`，终止（充值或等待限流解除） |
| 未配置 | 不尝试，等同原版行为 |

403 / 451 的处理需要特别说明：Firecrawl 对部分站点（如 LinkedIn）返回 `We do not support this site`。这是上游的服务范围限制，不属于调用方参数错误。若归入 `BAD_INPUT`，会因 `FINAL_CODES` 规则终止整条链，导致本可成功的 Jina / Exa 失去机会。因此归类为 `UPSTREAM_BROKEN`，使链继续回退。

分级规则沿用 Agent Reach 自身的 `FINAL_CODES` 语义：仅用户可自行修复的错误终止链，上游故障一律回退。

## 测试

```bash
python tests/mock_firecrawl.py --port 3012 &   # 协议 mock
python tests/test_e2e.py                       # 默认：23 项
FIRECRAWL_LIVE=1 python tests/test_e2e.py      # 追加真实托管服务的 keyless 断言
```

测试用例使用一次性 `HOME`，避免 Agent Reach 的 `state.json` 将某个后端的 120 秒暂停状态带入下一个用例。

覆盖项：

| 目标 | 结果 |
|---|---|
| mock 协议栈 | 23/23（LIVE 模式 24/24） |
| 真实 `api.firecrawl.dev` read | `backend: firecrawl`，一次成功，标题与正文正确 |
| 真实 search | 3 条结果，正文 52K / 121K / 61K 字符 |
| 中文站点（Gitee） | 21168 字符正文，标题正确 |
| `agent-reach read <url>` 自动选渠道 | `channel: web, backend: firecrawl` |
| public_web 继承（linkedin） | `public-web/firecrawl` 位于尝试链首位 |
| 403 拒抓回退 | `firecrawl(403) -> jina -> exa -> opencli` |
| 升级自愈 | 还原启动器 → doctor=1 → 执行一次 → doctor=0 |

## 文件结构

```
check_env.py               安装前环境自检（Python / agent-reach / 目标目录可写）
agent_reach_firecrawl.py   后端实现、补丁逻辑与自愈触发
install.py                 安装 / 卸载 / 状态 / doctor / heal
tools/rewrite_launcher.py  安全重写 zipapp 的 __main__.py
tests/mock_firecrawl.py    /v2/scrape、/v2/search、/v2/map 的协议 mock
tests/test_e2e.py          端到端断言
```

## 已知边界

- 托管服务在无密钥时仅有 keyless 额度，支持 scrape 与部分 search；`map` / `crawl` 返回 401，需配置密钥。生产环境建议配置密钥。
- `onlyMainContent: true` 会丢弃导航与页脚，需要完整 DOM 时应调整 payload。
- 搜索的 `sources.web` 仅返回网页结果，不含 news / images。
- 在 `public_web` 链路上，若 Firecrawl 拒抓某站点，每个新 URL 都会重新尝试一次；Agent Reach 自身的 120 秒后端暂停机制会限制重复开销。
- 启动器改写依赖 distlib zipapp 的布局。若上游更换打包方式，`--doctor` 会报告 STALE，此时 `.pth` 仍覆盖 `python -m` 入口。
