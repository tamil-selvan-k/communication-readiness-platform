/**
 * Lightweight Short Logger
 * Formats and maintains compact, single-line log entries in logs/app.log.
 */

type LogLevel = 'INFO' | 'WARN' | 'ERROR';

function getShortTimestamp(): string {
  const now = new Date();
  const YYYY = now.getFullYear();
  const MM = String(now.getMonth() + 1).padStart(2, '0');
  const DD = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${YYYY}-${MM}-${DD} ${hh}:${mm}:${ss}`;
}

const STORAGE_KEY = 'crp_short_logs';
const MAX_BUFFER = 100;

function persistShortLog(line: string) {
  // 1. Dev only: the Vite dev server appends to logs/app.log. Production has no such
  //    endpoint, and posting there would fill the console with failed requests.
  if (import.meta.env.DEV) try {
    fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ line })
    }).catch(() => {
      // Ignore background network errors in offline/static environments
    });
  } catch {}

  // 2. Cache locally for quick inspection & export
  try {
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    existing.push(line);
    if (existing.length > MAX_BUFFER) {
      existing.splice(0, existing.length - MAX_BUFFER);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  } catch {}
}

export const logger = {
  info(tag: string, message: string) {
    const line = `[${getShortTimestamp()}] [INFO] [${tag.toUpperCase()}] ${message}`;
    console.log(line);
    persistShortLog(line);
  },

  warn(tag: string, message: string) {
    const line = `[${getShortTimestamp()}] [WARN] [${tag.toUpperCase()}] ${message}`;
    console.warn(line);
    persistShortLog(line);
  },

  error(tag: string, message: string) {
    const line = `[${getShortTimestamp()}] [ERROR] [${tag.toUpperCase()}] ${message}`;
    console.error(line);
    persistShortLog(line);
  },

  getRecentLogs(): string[] {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  },

  downloadLogFile() {
    const logs = this.getRecentLogs();
    const content = logs.length > 0 
      ? logs.join('\n') 
      : `[${getShortTimestamp()}] [INFO] [SYS] Platform operational - no error events recorded`;
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'app.log';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
};
