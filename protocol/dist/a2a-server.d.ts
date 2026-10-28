/**
 * A2A Server for Agent-Reach
 * Exposes Agent-Reach channels as A2A skills via JSON-RPC 2.0 over HTTP
 */
export interface A2AServerOptions {
    port: number;
    host?: string;
    baseUrl?: string;
}
export declare function startA2AServer(options: A2AServerOptions): Promise<void>;
//# sourceMappingURL=a2a-server.d.ts.map