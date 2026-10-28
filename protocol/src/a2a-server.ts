/**
 * A2A Server for Agent-Reach
 * Exposes Agent-Reach channels as A2A skills via JSON-RPC 2.0 over HTTP
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { parse as parseUrl } from 'node:url';
import { createRequire } from 'node:module';
import {
  AgentCard,
  AgentSkill,
  Task,
  TaskState,
  TaskStatus,
  Message,
  Part,
  Artifact,
  TextPart,
  TaskSendParams,
  TaskGetParams,
  TaskCancelParams,
  TaskSubscribeParams,
  MessageSendParams,
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCError,
  A2AErrorCodes,
  AgentCard as AgentCardType,
  TaskSendResponse,
  A2A_CURRENT_VERSION,
  A2A_VERSION_HEADER,
  TaskStatusUpdateEvent,
} from './a2a-types.js';
import { CHANNEL_DEFINITIONS, getChannel, getAction } from './channel-definitions.js';
import { executeChannelAction, executeAutoRead } from './cli-wrapper.js';

const require = createRequire(import.meta.url);
const { v4: uuidv4 } = require('uuid');

// ============================================
// In-Memory Task Store (replace with Redis in production)
// ============================================

interface StoredTask extends Task {
  createdAt: string;
  updatedAt: string;
  streamingSubscribers?: Set<ServerResponse>;
}

const taskStore = new Map<string, StoredTask>();

function generateTaskId(): string {
  return `task-${uuidv4()}`;
}

function generateContextId(): string {
  return `ctx-${uuidv4()}`;
}

function generateMessageId(): string {
  return `msg-${uuidv4()}`;
}

// ============================================
// Build Agent Card
// ============================================

function buildAgentCard(baseUrl: string): AgentCardType {
  const skills: AgentSkill[] = [];

  for (const channel of CHANNEL_DEFINITIONS) {
    for (const action of channel.actions) {
      skills.push({
        id: `${channel.id}_${action.name}`,
        name: `${channel.name} - ${action.description}`,
        description: `[${channel.name}] ${action.description}. Parameters: ${action.params.map(p => p.name).join(', ')}`,
        tags: [channel.id, action.name, 'search', 'read', 'data-retrieval'],
        examples: [
          `Use ${channel.id}_${action.name} to ${action.description.toLowerCase()}`,
        ],
        inputModes: ['text'],
        outputModes: ['text'],
      });
    }
  }

  // Add auto_read skill
  skills.push({
    id: 'auto_read',
    name: 'Auto-detect platform and read URL',
    description: 'Automatically detects the platform from a URL (GitHub, Bilibili, YouTube, Twitter, etc.) and reads the content',
    tags: ['auto', 'read', 'url', 'multi-platform'],
    examples: ['Read https://github.com/microsoft/TypeScript', 'Read https://www.bilibili.com/video/BV1TH9uBBEwa'],
    inputModes: ['text'],
    outputModes: ['text'],
  });

  return {
    name: 'Agent-Reach',
    description: 'Multi-platform content retrieval agent with 14 channels (GitHub, Bilibili, YouTube, Twitter, Reddit, Xiaohongshu, V2EX, Xueqiu, Xiaoyuzhou, LinkedIn, BOSS, Instagram, Facebook, Web). Read-only, no authentication required for public content.',
    url: baseUrl,
    version: '1.0.0',
    capabilities: {
      streaming: true,
      pushNotifications: false,
      extensions: [],
    },
    skills,
    defaultInputModes: ['text'],
    defaultOutputModes: ['text'],
    securitySchemes: {},
    supportedInterfaces: ['a2a'],
  };
}

// ============================================
// Task Execution
// ============================================

/**
 * Structured invocation payload.
 *
 * Callers that already know which channel and action they want can bypass
 * natural-language intent parsing by putting this in the message metadata.
 * This is the only lossless way to invoke actions with more than one
 * string parameter - the intent parser can only recover the first one.
 */
interface StructuredInvocation {
  channel?: string;
  action?: string;
  params?: Record<string, unknown>;
}

/**
 * Read a structured invocation from the message metadata, if present.
 */
function readStructuredInvocation(message: Message): StructuredInvocation | undefined {
  const metadata = message.metadata as { agentReach?: StructuredInvocation } | undefined;
  const structured = metadata?.agentReach;

  if (!structured || typeof structured !== 'object') {
    return undefined;
  }

  if (typeof structured.channel !== 'string' || typeof structured.action !== 'string') {
    return undefined;
  }

  return structured;
}

async function executeTask(task: StoredTask): Promise<void> {
  const { message } = task.metadata as { message: Message } || { message: undefined };
  if (!message) {
    task.status = { state: 'FAILED', message: createErrorMessage('No message in task') };
    return;
  }

  // Extract intent from message
  const textPart = message.parts.find(p => p.type === 'text') as TextPart | undefined;
  if (!textPart) {
    task.status = { state: 'FAILED', message: createErrorMessage('No text part in message') };
    return;
  }

  // A structured invocation takes precedence over natural-language parsing.
  const structured = readStructuredInvocation(message);
  let channelId: string | undefined;
  let actionName: string | undefined;
  let params: Record<string, unknown>;

  if (structured) {
    channelId = structured.channel;
    actionName = structured.action;
    params = structured.params ?? {};
  } else {
    const parsed = parseIntent(textPart.text);
    channelId = parsed.channelId;
    actionName = parsed.actionName;
    params = parsed.params;
  }

  if (!channelId || !actionName) {
    // Try auto_read as fallback
    const urlMatch = textPart.text.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      await executeAutoReadTask(task, urlMatch[0]);
    } else {
      task.status = { state: 'FAILED', message: createErrorMessage(`Could not parse intent from: ${textPart.text}`) };
    }
    return;
  }

  task.status = { state: 'WORKING', message: createMessage(`Executing ${channelId}_${actionName}...`) };
  notifySubscribers(task);

  try {
    const result = await executeChannelAction(channelId, actionName, params);

    if (!result.ok) {
      task.status = {
        state: 'FAILED',
        message: createErrorMessage(`Error (${result.error?.code}): ${result.error?.message}`),
      };
      return;
    }

    // Convert result to artifacts. Each artifact carries both a readable
    // text rendering and the structured payload, so clients can use either.
    const artifacts = result.items?.map((item, index) => ({
      artifactId: `artifact-${index}`,
      name: item.title || `Result ${index + 1}`,
      parts: [
        {
          type: 'text' as const,
          text: formatItemAsText(item),
        },
        {
          type: 'data' as const,
          data: {
            title: item.title ?? '',
            url: item.url ?? '',
            author: item.author ?? '',
            published_at: item.published_at ?? '',
            text: item.text ?? '',
          },
        },
      ],
    })) || [];

    task.artifacts = artifacts;
    task.status = { state: 'COMPLETED', message: createMessage(`Completed ${channelId}_${actionName} with ${artifacts.length} results`) };
  } catch (error) {
    task.status = { state: 'FAILED', message: createErrorMessage(`Execution failed: ${error instanceof Error ? error.message : String(error)}`) };
  }

  task.updatedAt = new Date().toISOString();
  notifySubscribers(task);
}

async function executeAutoReadTask(task: StoredTask, url: string): Promise<void> {
  task.status = { state: 'WORKING', message: createMessage(`Auto-reading ${url}...`) };
  notifySubscribers(task);

  try {
    const result = await executeAutoRead(url);

    if (!result.ok) {
      task.status = {
        state: 'FAILED',
        message: createErrorMessage(`Error (${result.error?.code}): ${result.error?.message}`),
      };
      return;
    }

    const artifacts = result.items?.map((item, index) => ({
      artifactId: `artifact-${index}`,
      name: item.title || `Result ${index + 1}`,
      parts: [
        {
          type: 'text' as const,
          text: formatItemAsText(item),
        },
        {
          type: 'data' as const,
          data: {
            title: item.title ?? '',
            url: item.url ?? '',
            author: item.author ?? '',
            published_at: item.published_at ?? '',
            text: item.text ?? '',
          },
        },
      ],
    })) || [];

    task.artifacts = artifacts;
    task.status = { state: 'COMPLETED', message: createMessage(`Auto-read completed with ${artifacts.length} results`) };
  } catch (error) {
    task.status = { state: 'FAILED', message: createErrorMessage(`Auto-read failed: ${error instanceof Error ? error.message : String(error)}`) };
  }

  task.updatedAt = new Date().toISOString();
  notifySubscribers(task);
}

// ============================================
// Intent Parsing (Simple keyword-based)
// ============================================

function parseIntent(text: string): { channelId?: string; actionName?: string; params: Record<string, unknown> } {
  const lower = text.toLowerCase();
  const params: Record<string, unknown> = {};

  // Extract quoted strings as potential queries/URLs
  const quotedMatches = text.match(/["']([^"']+)["']/g);
  const unquoted = text.replace(/["']([^"']+)["']/g, '').trim();

  // Platform detection
  let channelId: string | undefined;
  let actionName: string | undefined;

  // URL-based detection (highest priority)
  const urlMatch = text.match(/https?:\/\/[^\s]+/);
  if (urlMatch) {
    const url = urlMatch[0];
    if (url.includes('github.com')) {
      channelId = 'github';
      if (url.includes('/issues/') || url.includes('/pull/')) actionName = 'read';
      else actionName = 'read';
      params.target = url;
    } else if (url.includes('bilibili.com') || url.includes('b23.tv')) {
      channelId = 'bilibili';
      actionName = 'read';
      params.target = url;
    } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
      channelId = 'youtube';
      actionName = 'read';
      params.target = url;
    } else if (url.includes('twitter.com') || url.includes('x.com')) {
      channelId = 'twitter';
      actionName = 'read';
      params.target = url;
    } else if (url.includes('reddit.com')) {
      channelId = 'reddit';
      actionName = 'read';
      params.target = url;
    } else if (url.includes('xiaohongshu.com') || url.includes('xhslink.com')) {
      channelId = 'xiaohongshu';
      actionName = 'read';
      params.target = url;
    } else if (url.includes('v2ex.com')) {
      channelId = 'v2ex';
      actionName = 'read';
      params.target = url;
    } else if (url.includes('xueqiu.com')) {
      channelId = 'xueqiu';
      actionName = 'quote';
      params.target = url;
    } else if (url.includes('xiaoyuzhou.fm')) {
      channelId = 'xiaoyuzhou';
      actionName = 'transcribe';
      params.target = url;
    } else if (url.includes('linkedin.com')) {
      channelId = 'linkedin';
      actionName = 'read';
      params.target = url;
    } else if (url.includes('zhipin.com')) {
      channelId = 'boss';
      actionName = 'read';
      params.target = url;
    } else {
      // Generic web read
      channelId = 'web';
      actionName = 'read';
      params.target = url;
    }
    return { channelId, actionName, params };
  }

  // Keyword-based detection
  if (lower.includes('github') || lower.includes('repo') || lower.includes('repository')) {
    channelId = 'github';
    actionName = lower.includes('search') || lower.includes('找') || lower.includes('搜') ? 'search' : 'read';
  } else if (lower.includes('bilibili') || lower.includes('b 站') || lower.includes('b站')) {
    channelId = 'bilibili';
    actionName = lower.includes('search') || lower.includes('找') || lower.includes('搜') ? 'search' : 'read';
  } else if (lower.includes('youtube') || lower.includes('油管')) {
    channelId = 'youtube';
    actionName = lower.includes('search') || lower.includes('找') || lower.includes('搜') ? 'search' : 'read';
  } else if (lower.includes('twitter') || lower.includes('x.com') || lower.includes('推特')) {
    channelId = 'twitter';
    actionName = lower.includes('search') || lower.includes('找') || lower.includes('搜') ? 'search' : 'read';
  } else if (lower.includes('reddit')) {
    channelId = 'reddit';
    actionName = lower.includes('search') || lower.includes('找') || lower.includes('搜') ? 'search' : 'read';
  } else if (lower.includes('小红书') || lower.includes('xiaohongshu')) {
    channelId = 'xiaohongshu';
    actionName = lower.includes('search') || lower.includes('找') || lower.includes('搜') ? 'search' : 'read';
  } else if (lower.includes('v2ex')) {
    channelId = 'v2ex';
    actionName = lower.includes('hot') || lower.includes('热门') ? 'hot' : 'read';
  } else if (lower.includes('雪球') || lower.includes('xueqiu') || lower.includes('股票') || lower.includes('行情')) {
    channelId = 'xueqiu';
    actionName = lower.includes('quote') || lower.includes('行情') || lower.includes('价格') ? 'quote' : 'search';
  } else if (lower.includes('小宇宙') || lower.includes('xiaoyuzhou') || lower.includes('播客') || lower.includes('转录')) {
    channelId = 'xiaoyuzhou';
    actionName = 'transcribe';
  } else if (lower.includes('linkedin') || lower.includes('领英')) {
    channelId = 'linkedin';
    actionName = lower.includes('job') || lower.includes('职位') || lower.includes('招聘') ? 'jobs' : 'read';
  } else if (lower.includes('boss') || lower.includes('直聘') || lower.includes('招聘')) {
    channelId = 'boss';
    actionName = lower.includes('search') || lower.includes('找') || lower.includes('搜') ? 'search' : 'read';
  } else if (lower.includes('instagram') || lower.includes('ins')) {
    channelId = 'instagram';
    actionName = lower.includes('search') || lower.includes('找') || lower.includes('搜') ? 'search' : 'profile';
  } else if (lower.includes('facebook') || lower.includes('fb')) {
    channelId = 'facebook';
    actionName = lower.includes('search') || lower.includes('找') || lower.includes('搜') ? 'search' : 'profile';
  }

  // Extract parameters based on channel/action
  if (channelId && actionName) {
    const channel = getChannel(channelId);
    const action = channel ? getAction(channelId, actionName) : undefined;

    if (action) {
      // Try to extract query from quoted strings or remaining text
      const query = quotedMatches?.[0]?.replace(/["']/g, '') || unquoted;
      if (query) {
        // Find the first string param
        const stringParam = action.params.find(p => p.type === 'string' && p.required);
        if (stringParam) {
          params[stringParam.name] = query;
        }
      }

      // Extract limit if mentioned
      const limitMatch = text.match(/(\d+)\s*(条|个|results?|items?)/i);
      if (limitMatch) {
        params.limit = parseInt(limitMatch[1], 10);
      }
    }
  }

  return { channelId, actionName, params };
}

// ============================================
// Helpers
// ============================================

function createMessage(text: string): Message {
  return {
    role: 'agent',
    parts: [{ type: 'text', text }],
    messageId: generateMessageId(),
  };
}

function createErrorMessage(text: string): Message {
  return {
    role: 'agent',
    parts: [{ type: 'text', text: `Error: ${text}` }],
    messageId: generateMessageId(),
  };
}

function formatItemAsText(item: { title?: string; url?: string; author?: string; published_at?: string; text?: string }): string {
  const parts: string[] = [];
  if (item.title) parts.push(`**${item.title}**`);
  if (item.url) parts.push(item.url);
  if (item.author) parts.push(`by ${item.author}`);
  if (item.published_at) parts.push(`@ ${item.published_at}`);
  if (item.text) parts.push(item.text.slice(0, 1000) + (item.text.length > 1000 ? '...' : ''));
  return parts.join('\n');
}

// ============================================
// SSE Streaming
// ============================================

function notifySubscribers(task: StoredTask): void {
  if (!task.streamingSubscribers) return;

  const event: TaskStatusUpdateEvent = {
    taskId: task.id,
    contextId: task.contextId,
    status: task.status,
    final: ['COMPLETED', 'FAILED', 'CANCELED', 'REJECTED', 'AUTH_REQUIRED'].includes(task.status.state),
  };

  const data = `data: ${JSON.stringify(event)}\n\n`;

  for (const subscriber of task.streamingSubscribers) {
    try {
      subscriber.write(data);
    } catch {
      // Ignore write errors
    }
  }

  // If final, close all subscribers
  if (event.final) {
    for (const subscriber of task.streamingSubscribers) {
      try {
        subscriber.end();
      } catch {
        // Ignore
      }
    }
    task.streamingSubscribers.clear();
  }
}

function addStreamingSubscriber(taskId: string, res: ServerResponse): void {
  const task = taskStore.get(taskId);
  if (task) {
    if (!task.streamingSubscribers) task.streamingSubscribers = new Set();
    task.streamingSubscribers.add(res);

    // Send current status immediately
    const event: TaskStatusUpdateEvent = {
      taskId: task.id,
      contextId: task.contextId,
      status: task.status,
      final: ['COMPLETED', 'FAILED', 'CANCELED', 'REJECTED', 'AUTH_REQUIRED'].includes(task.status.state),
    };
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }
}

function removeStreamingSubscriber(taskId: string, res: ServerResponse): void {
  const task = taskStore.get(taskId);
  if (task?.streamingSubscribers) {
    task.streamingSubscribers.delete(res);
  }
}

// ============================================
// JSON-RPC Handler
// ============================================

function createErrorResponse(id: string | number, code: number, message: string, data?: unknown): JSONRPCResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message, data },
  };
}

function createSuccessResponse(id: string | number, result: unknown): JSONRPCResponse {
  return {
    jsonrpc: '2.0',
    id,
    result,
  };
}

async function handleJSONRPC(request: JSONRPCRequest, baseUrl: string): Promise<JSONRPCResponse> {
  const { id, method, params } = request;

  try {
    switch (method) {
      // Agent Card
      case 'agent/getCard': {
        const card = buildAgentCard(baseUrl);
        return createSuccessResponse(id, card);
      }

      case 'agent/getExtendedCard': {
        // For now, return same as regular card
        const card = buildAgentCard(baseUrl);
        return createSuccessResponse(id, card);
      }

      // Task Operations
      case 'tasks/send': {
        const sendParams = params as TaskSendParams;
        return await handleTaskSend(id, sendParams);
      }

      case 'tasks/get': {
        const getParams = params as TaskGetParams;
        return await handleTaskGet(id, getParams);
      }

      case 'tasks/cancel': {
        const cancelParams = params as TaskCancelParams;
        return await handleTaskCancel(id, cancelParams);
      }

      case 'tasks/subscribe': {
        const subscribeParams = params as TaskSubscribeParams;
        return await handleTaskSubscribe(id, subscribeParams);
      }

      case 'tasks/list': {
        // Not fully implemented yet
        return createSuccessResponse(id, { tasks: Array.from(taskStore.values()).map(t => ({ id: t.id, contextId: t.contextId, status: t.status })) });
      }

      // Message Operations
      case 'messages/send': {
        const messageParams = params as MessageSendParams;
        return await handleMessageSend(id, messageParams);
      }

      // Push Notifications (not implemented)
      case 'pushNotifications/create':
      case 'pushNotifications/get':
      case 'pushNotifications/list':
      case 'pushNotifications/delete': {
        return createErrorResponse(id, A2AErrorCodes.PUSH_NOTIFICATION_NOT_SUPPORTED, 'Push notifications not supported');
      }

      default: {
        return createErrorResponse(id, A2AErrorCodes.METHOD_NOT_FOUND, `Method not found: ${method}`);
      }
    }
  } catch (error) {
    return createErrorResponse(id, A2AErrorCodes.INTERNAL_ERROR, `Internal error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function handleTaskSend(id: string | number, params: TaskSendParams): Promise<JSONRPCResponse> {
  const taskId = params.id || generateTaskId();
  const contextId = params.contextId || generateContextId();

  const task: StoredTask = {
    id: taskId,
    contextId,
    status: { state: 'SUBMITTED', message: params.message },
    history: [params.message],
    metadata: { message: params.message, returnImmediately: params.returnImmediately },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  taskStore.set(taskId, task);

  // Execute task asynchronously
  if (!params.returnImmediately) {
    executeTask(task).catch(console.error);
  } else {
    // For returnImmediately, just return task ID
    task.status = { state: 'WORKING' };
  }

  const response: TaskSendResponse = params.returnImmediately
    ? { taskId, contextId }
    : task;

  return createSuccessResponse(id, response);
}

async function handleTaskGet(id: string | number, params: TaskGetParams): Promise<JSONRPCResponse> {
  const task = taskStore.get(params.id);
  if (!task) {
    return createErrorResponse(id, A2AErrorCodes.TASK_NOT_FOUND, `Task not found: ${params.id}`);
  }

  // Optionally limit history
  let history = task.history || [];
  if (params.historyLength && params.historyLength > 0 && history.length > params.historyLength) {
    history = history.slice(-params.historyLength);
  }

  return createSuccessResponse(id, { task: { ...task, history } });
}

async function handleTaskCancel(id: string | number, params: TaskCancelParams): Promise<JSONRPCResponse> {
  const task = taskStore.get(params.id);
  if (!task) {
    return createErrorResponse(id, A2AErrorCodes.TASK_NOT_FOUND, `Task not found: ${params.id}`);
  }

  if (['COMPLETED', 'FAILED', 'CANCELED', 'REJECTED'].includes(task.status.state)) {
    return createErrorResponse(id, A2AErrorCodes.TASK_NOT_CANCELABLE, `Task cannot be canceled in state: ${task.status.state}`);
  }

  task.status = { state: 'CANCELED', message: createMessage('Task canceled by user') };
  task.updatedAt = new Date().toISOString();
  notifySubscribers(task);

  return createSuccessResponse(id, { task });
}

async function handleTaskSubscribe(id: string | number, params: TaskSubscribeParams): Promise<JSONRPCResponse> {
  const task = taskStore.get(params.id);
  if (!task) {
    return createErrorResponse(id, A2AErrorCodes.TASK_NOT_FOUND, `Task not found: ${params.id}`);
  }

  // For streaming, we handle this at HTTP level, not JSON-RPC
  // This just confirms subscription is possible
  return createSuccessResponse(id, { subscribed: true, taskId: params.id });
}

async function handleMessageSend(id: string | number, params: MessageSendParams): Promise<JSONRPCResponse> {
  // Create a new task for this message
  const taskId = generateTaskId();
  const contextId = params.message.contextId || generateContextId();

  const task: StoredTask = {
    id: taskId,
    contextId,
    status: { state: 'SUBMITTED', message: params.message },
    history: [params.message],
    metadata: { message: params.message, returnImmediately: params.returnImmediately },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  taskStore.set(taskId, task);

  if (!params.returnImmediately) {
    executeTask(task).catch(console.error);
  }

  return createSuccessResponse(id, { taskId, contextId });
}

// ============================================
// HTTP Server
// ============================================

export interface A2AServerOptions {
  port: number;
  host?: string;
  baseUrl?: string; // e.g., "http://localhost:8080"
}

export async function startA2AServer(options: A2AServerOptions): Promise<void> {
  const { port, host = '0.0.0.0', baseUrl } = options;
  const serverBaseUrl = baseUrl || `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`;

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, A2A-Version');
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Version header check
    const version = req.headers[A2A_VERSION_HEADER.toLowerCase()];
    if (version && version !== A2A_CURRENT_VERSION) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(createErrorResponse(0, A2AErrorCodes.VERSION_NOT_SUPPORTED, `Unsupported A2A version: ${version}`)));
      return;
    }

    const parsedUrl = parseUrl(req.url || '', true);
    const path = parsedUrl.pathname || '/';

    // Agent Card endpoint
    if (path === '/.well-known/agent.json' && req.method === 'GET') {
      const card = buildAgentCard(serverBaseUrl);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(card, null, 2));
      return;
    }

    // JSON-RPC endpoint
    if (path === '/rpc' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }

      try {
        const request = JSON.parse(body) as JSONRPCRequest;

        // Validate JSON-RPC
        if (request.jsonrpc !== '2.0') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(createErrorResponse(request.id || 0, A2AErrorCodes.INVALID_PARAMS, 'Invalid JSON-RPC version')));
          return;
        }

        const response = await handleJSONRPC(request, serverBaseUrl);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(createErrorResponse(0, A2AErrorCodes.INVALID_PARAMS, `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`)));
      }
      return;
    }

    // SSE Streaming endpoint: /tasks/{id}/stream
    const streamMatch = path.match(/^\/tasks\/([^\/]+)\/stream$/);
    if (streamMatch && req.method === 'GET') {
      const taskId = streamMatch[1];
      const task = taskStore.get(taskId);

      if (!task) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(createErrorResponse(0, A2AErrorCodes.TASK_NOT_FOUND, `Task not found: ${taskId}`)));
        return;
      }

      // SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      // Send initial status
      const initialEvent: TaskStatusUpdateEvent = {
        taskId: task.id,
        contextId: task.contextId,
        status: task.status,
        final: ['COMPLETED', 'FAILED', 'CANCELED', 'REJECTED', 'AUTH_REQUIRED'].includes(task.status.state),
      };
      res.write(`data: ${JSON.stringify(initialEvent)}\n\n`);

      // Add subscriber
      addStreamingSubscriber(taskId, res);

      // Cleanup on close
      req.on('close', () => {
        removeStreamingSubscriber(taskId, res);
      });

      return;
    }

    // Health check
    if (path === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', tasks: taskStore.size }));
      return;
    }

    // Not found
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(createErrorResponse(0, A2AErrorCodes.METHOD_NOT_FOUND, `Not found: ${path}`)));
  });

  return new Promise<void>((resolve, reject) => {
    server.listen(port, host, () => {
      console.error(`[Agent-Reach A2A] Server started on http://${host}:${port}`);
      console.error(`[Agent-Reach A2A] Agent Card: ${serverBaseUrl}/.well-known/agent.json`);
      console.error(`[Agent-Reach A2A] JSON-RPC endpoint: ${serverBaseUrl}/rpc`);
      resolve();
    });

    server.on('error', (err) => {
      reject(err);
    });
  });
}

// ============================================
// CLI Entry Point
// ============================================

async function main() {
  const port = parseInt(process.env.PORT || '8080', 10);
  const host = process.env.HOST || '0.0.0.0';
  const baseUrl = process.env.BASE_URL;

  await startA2AServer({ port, host, baseUrl });
}

main().catch((err) => {
  console.error('[Agent-Reach A2A] Fatal error:', err);
  process.exit(1);
});