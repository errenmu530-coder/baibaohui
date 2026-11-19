import { getContext } from '@/st/context';

/** 用户在魔法棒中为下一次整楼批量任务填写的要求；不写进角色档案或长期设置。 */
interface PendingGuidance {
  chatId: string;
  minFloor: number;
  text: string;
}

let pending: PendingGuidance | null = null;

export function setPendingFloorGuidance(text: string): boolean {
  const context = getContext();
  const chatId = context?.getCurrentChatId?.();
  if (!context || !chatId) return false;
  const value = text.trim().slice(0, 1000);
  pending = value ? { chatId, minFloor: Math.max(0, context.chat.length - 1), text: value } : null;
  return true;
}

export function currentFloorGuidance(): string {
  const chatId = getContext()?.getCurrentChatId?.();
  return pending && pending.chatId === chatId ? pending.text : '';
}

export function takeFloorGuidance(chatId: string, floor: number): string {
  if (!pending || pending.chatId !== chatId || floor < pending.minFloor) return '';
  const text = pending.text;
  pending = null;
  return text;
}
