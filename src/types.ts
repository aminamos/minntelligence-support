export interface EmailBinding {
  send(msg: { to: string; from: string; subject: string; text?: string; html?: string }): Promise<{ messageId: string }>;
}

export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  EMAIL: EmailBinding;
  LOCK_KEY?: string;
  FORWARD_TO?: string;
}
