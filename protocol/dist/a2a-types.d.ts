/**
 * A2A Protocol Types
 * Based on https://a2a-protocol.org/latest/specification/
 */
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
export declare const A2AErrorCodes: {
    readonly TASK_NOT_FOUND: -32001;
    readonly TASK_NOT_CANCELABLE: -32002;
    readonly PUSH_NOTIFICATION_NOT_SUPPORTED: -32003;
    readonly VERSION_NOT_SUPPORTED: -32004;
    readonly INVALID_PARAMS: -32602;
    readonly METHOD_NOT_FOUND: -32601;
    readonly INTERNAL_ERROR: -32603;
};
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
    in?: 'query' | 'header' | 'cookie';
    name?: string;
    scheme?: string;
    flows?: Record<string, unknown>;
    openIdConnectUrl?: string;
}
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
    bytes?: string;
}
export interface DataPart {
    type: 'data';
    data: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}
export type TaskState = 'SUBMITTED' | 'WORKING' | 'COMPLETED' | 'FAILED' | 'CANCELED' | 'INPUT_REQUIRED' | 'REJECTED' | 'AUTH_REQUIRED';
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
export interface TaskSendParams {
    id?: string;
    contextId?: string;
    message: Message;
    pushNotificationConfig?: PushNotificationConfig;
    returnImmediately?: boolean;
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
export interface MessageSendParams {
    message: Message;
    pushNotificationConfig?: PushNotificationConfig;
    returnImmediately?: boolean;
}
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
export type TaskSendResponse = Task | {
    taskId: string;
    contextId: string;
};
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
export interface ExtendedAgentCard extends AgentCard {
    securityDetails?: Record<string, unknown>;
}
export declare const A2A_VERSION_HEADER = "A2A-Version";
export declare const A2A_CURRENT_VERSION = "1.0";
//# sourceMappingURL=a2a-types.d.ts.map