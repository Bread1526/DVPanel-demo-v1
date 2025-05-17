
import type { LogEntry } from "@/lib/logger";

export interface FetchLogsResult {
  logs?: LogEntry[];
  error?: string;
  status: 'success' | 'error' | 'unauthorized';
}
