/**
 * A2A Protocol Types
 * Based on https://a2a-protocol.org/latest/specification/
 */

// ============================================
// Base Types
// ============================================

export interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
}

export interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: JSONRPCError;
}

export interface JSONRPCError {
  code: number;
  message: string;
  data?: unknown;
}

// A2A Error Codes
export const A2AErrorCodes = {
  TASK_NOT_FOUND: -32001,
  TASK_NOT_CANCELABLE: -32002,
  PUSH_NOTIFICATION_NOT_SUPPORTED: -32003,
  VERSION_NOT_SUPPORTED: -32004,
  INVALID_PARAMS: -32602,
  METHOD_NOT_FOUND: -32601,
  INTERNAL_ERROR: -32603,
} as const;

// ============================================
// Agent Card
// ============================================

export interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities: AgentCapabilities;
  skills: AgentSkill[];
  securitySchemes?: Record<string, SecurityScheme>;
  supportedInterfaces?: string[];
  defaultInputModes?: string[];
  defaultOutputModes?: string[];
}

export interface AgentCapabilities {
  streaming: boolean;
  pushNotifications: boolean;
  extensions?: AgentExtension[];
}

export interface AgentExtension {
  name: string;
  version: string;
  description?: string;
  params?: Record<string, unknown>;
}

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  tags?: string[];
  examples?: string[];
  inputModes?: string[];
  outputModes?: string[];
}

export interface SecurityScheme {
  type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';
  description?: string;
  // apiKey
  in?: 'query' | 'header' | 'cookie';
  name?: string;
  // http
  scheme?: string;
  // oauth2
  flows?: Record<string, unknown>;
  // openIdConnect
  openIdConnectUrl?: string;
}

// ============================================
// Message & Parts
// ============================================

export type MessageRole = 'user' | 'agent';

export interface Message {
  role: MessageRole;
  parts: Part[];
  messageId?: string;
  contextId?: string;
  taskId?: string;
  metadata?: Record<string, unknown>;
}

export type Part = TextPart | FilePart | DataPart;

export interface TextPart {
  type: 'text';
  text: string;
  metadata?: Record<string, unknown>;
}

export interface FilePart {
  type: 'file';
  file: FileContent;
  metadata?: Record<string, unknown>;
}

export interface FileContent {
  name?: string;
  mimeType?: string;
  url?: string;
  bytes?: string; // base64 encoded
}

export interface DataPart {
  type: 'data';
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// ============================================
// Task
// ============================================

export type TaskState =
  | 'SUBMITTED'
  | 'WORKING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELED'
  | 'INPUT_REQUIRED'
  | 'REJECTED'
  | 'AUTH_REQUIRED';

export interface TaskStatus {
  state: TaskState;
  message?: Message;
  timestamp?: string;
}

export interface Task {
  id: string;
  contextId: string;
  status: TaskStatus;
  artifacts?: Artifact[];
  history?: Message[];
  metadata?: Record<string, unknown>;
}

export interface Artifact {
  artifactId: string;
  name?: string;
  description?: string;
  parts: Part[];
  metadata?: Record<string, unknown>;
  index?: number;
  append?: boolean;
  lastChunk?: boolean;
}

// ============================================
// Task Send Parameters
// ============================================

export interface TaskSendParams {
  id?: string;
  contextId?: string;
  message: Message;
  pushNotificationConfig?: PushNotificationConfig;
  returnImmediately?: boolean; // If true, returns task immediately without waiting for completion
}

export interface TaskGetParams {
  id: string;
  historyLength?: number;
}

export interface TaskCancelParams {
  id: string;
}

export interface TaskSubscribeParams {
  id: string;
}

// ============================================
// Message Send Parameters
// ============================================

export interface MessageSendParams {
  message: Message;
  pushNotificationConfig?: PushNotificationConfig;
  returnImmediately?: boolean;
}

// ============================================
// Push Notifications
// ============================================

export interface PushNotificationConfig {
  url: string;
  token?: string;
  authentication?: SecurityScheme;
}

export interface PushNotificationCreateParams {
  taskId: string;
  config: PushNotificationConfig;
}

export interface PushNotificationGetParams {
  taskId: string;
}

export interface PushNotificationListParams {
  taskId: string;
}

export interface PushNotificationDeleteParams {
  taskId: string;
  configId: string;
}

// ============================================
// Response Types
// ============================================

export type TaskSendResponse = Task | { taskId: string; contextId: string };

export interface TaskGetResponse {
  task: Task;
}

export interface TaskCancelResponse {
  task: Task;
}

export interface TaskListResponse {
  tasks: Task[];
}

export interface MessageSendResponse {
  taskId?: string;
  contextId?: string;
  message?: Message;
}

// Streaming
export interface TaskStatusUpdateEvent {
  taskId: string;
  contextId: string;
  status: TaskStatus;
  final: boolean;
}

export interface TaskArtifactUpdateEvent {
  taskId: string;
  contextId: string;
  artifact: Artifact;
  append?: boolean;
  lastChunk?: boolean;
}

// ============================================
// Extended Agent Card (requires auth)
// ============================================

export interface ExtendedAgentCard extends AgentCard {
  // Additional fields for authenticated access
  securityDetails?: Record<string, unknown>;
}

// ============================================
// Version Header
// ============================================

export const A2A_VERSION_HEADER = 'A2A-Version';
export const A2A_CURRENT_VERSION = '1.0';