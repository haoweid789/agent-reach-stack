# @agent-reach/crewai

CrewAI adapter for [Agent-Reach](https://github.com/haoweid789/agent-reach-mcp).

## Install

```bash
npm install @agent-reach/crewai
```

`crewai` is an **optional** peer dependency — the adapter never imports it. The tool objects it produces use the plain `{ name, description, args_schema, run }` shape that CrewAI accepts, so version drift does not break the integration.

## Usage

```ts
import { Agent, Task } from 'crewai';
import { ReachTool } from '@agent-reach/crewai';

const agent = new Agent({
  role: '小红书研究员',
  goal: '找到深圳值得去的咖啡店',
  backstory: '你熟悉本地生活内容',
  tools: [ReachTool('xiaohongshu', 'search')],
});
```

### Reading any URL

```ts
import { ReachReadTool } from '@agent-reach/crewai';

const tools = [ReachReadTool()];
```

### One tool per action

```ts
import { ReachChannelTools } from '@agent-reach/crewai';

// search + read for GitHub
const tools = ReachChannelTools('github');
```

### Mixing channels and actions

```ts
import { ReachTools } from '@agent-reach/crewai';

const tools = ReachTools([
  { channel: 'github', action: 'search' },  // one tool
  { channel: 'v2ex' },                     // all four v2ex actions
]);
```

## Remote Agent-Reach

```ts
const tool = ReachTool('github', 'search', {
  mode: 'a2a',
  baseUrl: 'http://localhost:8080',
});
```

## License

MIT
