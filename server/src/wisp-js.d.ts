// Minimal type declarations for the parts of @mercuryworkshop/wisp-js NOVA uses.
declare module "@mercuryworkshop/wisp-js/server" {
  import type { WebSocket } from "ws";

  export interface WispOptions {
    hostname_blacklist: RegExp[] | null;
    hostname_whitelist: RegExp[] | null;
    port_blacklist: Array<number | [number, number]> | null;
    port_whitelist: Array<number | [number, number]> | null;
    allow_direct_ip: boolean;
    allow_private_ips: boolean;
    allow_loopback_ips: boolean;
    stream_limit_per_host: number;
    stream_limit_total: number;
    allow_udp_streams: boolean;
    allow_tcp_streams: boolean;
    dns_ttl: number;
    dns_cache_size: number;
    dns_method: "lookup" | "resolve" | ((hostname: string) => Promise<string>);
    dns_servers: string[] | null;
    dns_result_order: "ipv4first" | "ipv6first" | "verbatim";
    parse_real_ip: boolean;
    parse_real_ip_from: string[];
    send_buffer_size: number;
    wisp_version: 1 | 2;
    wisp_motd: string | null;
  }

  export interface ConnectionOptions {
    ping_interval?: number;
    wisp_version?: 1 | 2;
  }

  export class ServerConnection {
    constructor(ws: WebSocket, path: string, options?: ConnectionOptions);
    conn_id: string;
    streams: Record<number, unknown>;
    setup(): Promise<void>;
    run(): Promise<void>;
  }

  export const options: WispOptions;

  export const server: {
    options: WispOptions;
    ServerConnection: typeof ServerConnection;
  };

  export const logging: {
    DEBUG: number;
    INFO: number;
    WARN: number;
    ERROR: number;
    NONE: number;
    set_level(level: number): void;
  };
}
