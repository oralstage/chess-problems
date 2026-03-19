/// <reference types="@cloudflare/workers-types" />

interface Env {
  DB: D1Database;
  STATS_DB: D1Database;
  ADMIN_TOKEN?: string;
}
