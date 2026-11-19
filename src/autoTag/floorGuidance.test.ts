import { beforeEach, describe, expect, it, vi } from 'vitest';

const context = vi.hoisted(() => ({ chat: Array(5), getCurrentChatId: () => 'chat-a' }));
vi.mock('@/st/context', () => ({ getContext: () => context }));

import { currentFloorGuidance, setPendingFloorGuidance, takeFloorGuidance } from '@/autoTag/floorGuidance';

describe('floor guidance one-shot', () => {
  beforeEach(() => { setPendingFloorGuidance(''); });

  it('only applies to the same chat at or after the current floor, once', () => {
    expect(setPendingFloorGuidance('  苏灿灿平躺  ')).toBe(true);
    expect(currentFloorGuidance()).toBe('苏灿灿平躺');
    expect(takeFloorGuidance('chat-b', 4)).toBe('');
    expect(takeFloorGuidance('chat-a', 3)).toBe('');
    expect(takeFloorGuidance('chat-a', 5)).toBe('苏灿灿平躺');
    expect(takeFloorGuidance('chat-a', 6)).toBe('');
  });
});
