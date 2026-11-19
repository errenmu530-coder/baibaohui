import { describe, expect, it } from 'vitest';
import { localTagSearch, tagTranslation } from '@/floor/tagVocabulary';

describe('tagVocabulary local search', () => {
  it('finds the same entry by Chinese and English and keeps only the English tag for insertion', () => {
    const chinese = localTagSearch('短靴');
    const english = localTagSearch('ankle boots');
    expect(chinese.some(item => item.tag === 'ankle boots' && item.zh === '短靴')).toBe(true);
    expect(english.some(item => item.tag === 'ankle boots')).toBe(true);
    expect(tagTranslation('ankle_boots')).toBe('短靴');
  });

  it('filters local browse results by category', () => {
    expect(localTagSearch('', '头发').every(item => item.category === '头发')).toBe(true);
    expect(localTagSearch('靴子', '头发')).toEqual([]);
  });
});
