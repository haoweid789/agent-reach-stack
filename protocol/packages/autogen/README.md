# @agent-reach/autogen

AutoGen / AG2 adapter for [Agent-Reach](https://github.com/haoweid789/agent-reach-mcp).

## Install

```bash
npm install @agent-reach/autogen
```

`@ag2/autogen` and `@microsoft/autogen` are **optional** peer dependencies — the adapter never imports them. The function objects it produces use the plain `{ name, description, parameters, execute }` shape that AutoGen accepts.

## Usage

```ts
import { ConversableAgent } from '@ag2/autogen';
import { ReachFunction } from '@agent-reach/autogen';

const assistant = new ConversableAgent({
  name: 'researcher',
  functions: [ReachFunction('bilibili', 'read')],
});

const user = new ConversableAgent({ name: 'user' });

const result = await user.initiate_chat(assistant, message='帮我看看这个 B 站视频讲了什么');
```

### Reading any URL

```ts
import { ReachReadFunction } from '@agent-reach/autogen';

const functions = [ReachReadFunction()];
```

### One function per action

```ts
import { ReachChannelFunctions } from '@agent-reach/autogen';

const functions = ReachChannelFunctions('github');
```

### Mixing channels and actions

```ts
import { ReachFunctions } from '@agent-reach/autogen';

const functions = ReachFunctions([
  { channel: 'github', action: 'search' },
  { channel: 'xueqiu' },
]);
```

## Remote Agent-Reach

```ts
const fn = ReachFunction('github', 'search', {
  mode: 'a2a',
  baseUrl: 'http://localhost:8080',
});
```

## License

MIT
