import { reactive } from 'vue';

export type DiagnosticLevel = 'info' | 'warning' | 'error';

export interface DiagnosticEntry {
  id: number;
  at: number;
  level: DiagnosticLevel;
  event: string;
  detail: string;
}

/** 本次页面会话的运行事件；不保存提示词、密钥或聊天正文。 */
export const diagnosticEntries = reactive<DiagnosticEntry[]>([]);
let nextDiagnosticId = 1;

export function recordDiagnostic(level: DiagnosticLevel, event: string, detail = ''): void {
  try {
    diagnosticEntries.unshift({
      id: nextDiagnosticId++,
      at: Date.now(),
      level,
      event: event.slice(0, 120),
      detail: detail.slice(0, 500),
    });
    while (diagnosticEntries.length > 200) diagnosticEntries.pop();
  } catch {
    // 日志绝不能影响生图流程。
  }
}

export function clearDiagnostics(): void {
  diagnosticEntries.splice(0);
}
