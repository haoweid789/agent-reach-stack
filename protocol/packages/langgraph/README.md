# @agent-reach/langgraph

LangGraph adapter for [Agent-Reach](https://github.com/haoweid789/agent-reach-mcp).

## Install

```bash
npm install @agent-reach/langgraph
```

`@langchain/langgraph` is an **optional** peer dependency — the adapter never imports it, so it works with any LangGraph version (and with none at all, if you only use the tool specs).

## Usage

### As a graph node

```ts
import { StateGraph, Annotation } from '@langchain/langgraph';
import { createReachNode } from '@agent-reach/langgraph';

const State = Annotation.Root({
  reach: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  reachArgs: Annotation<Record<string, unknown>>({
    reducer: (_, b) => b,
    default: () => ({}),
  }),
});

const graph = new StateGraph(State)
  .addNode('search_github', createReachNode('github', 'search'))
  .addEdge('__start__', 'search_github')
  .compile();

const result = await graph.invoke({ reachArgs: { query: 'react hooks', limit: 5 } });
console.log(result.reach);
```

The node reads its arguments from `state.reachArgs` and writes the formatted result to `state.reach`. Both keys are configurable:

```ts
createReachNode('github', 'search', { query: 'default' }, {
  inputKey: 'myArgs',
  outputKey: 'myResult',
});
```

### Reading any URL

```ts
import { createReachReadNode } from '@agent-reach/langgraph';

const node = createReachReadNode({ urlKey: 'url' });
await node({ url: 'https://github.com/Panniantong/Agent-Reach' });
```

### As a LangChain-style tool

```ts
import { createReachTool } from '@agent-reach/langgraph';

const tool = createReachTool('xiaohongshu', 'search');
// { name, description, schema, func }
```

## Remote Agent-Reach

Point the adapter at a running A2A server instead of the local CLI:

```ts
const node = createReachNode('github', 'search', {}, {
  mode: 'a2a',
  baseUrl: 'http://localhost:8080',
});
```

## License

MIT
