import { beforeEach, describe, expect, it } from 'vitest';
import { getTagTranslationChannel, newChannel, settings } from '@/state/settings';

describe('tag 中文翻译渠道', () => {
  beforeEach(() => {
    settings.channels = [];
    settings.assignments = { tagGen: '', tagTranslateMode: 'tagGen', tagTranslate: '' };
  });

  it('默认跟随生成 tag 的副 API；未指派时跟随主 API', () => {
    expect(getTagTranslationChannel()).toBeNull();
    const tagGen = { ...newChannel(), name: '生成 tag' };
    settings.channels.push(tagGen);
    settings.assignments.tagGen = tagGen.id;
    expect(getTagTranslationChannel()?.id).toBe(tagGen.id);
  });

  it('独立模式只使用翻译专用渠道，不挪用生成 tag 的副 API', () => {
    const tagGen = { ...newChannel(), name: '生成 tag' };
    const translation = { ...newChannel(), name: '翻译' };
    settings.channels.push(tagGen, translation);
    settings.assignments = {
      tagGen: tagGen.id, tagTranslateMode: 'separate', tagTranslate: translation.id,
    };
    expect(getTagTranslationChannel()?.id).toBe(translation.id);
  });

  it('独立模式没有指派渠道时明确报错', () => {
    settings.assignments.tagTranslateMode = 'separate';
    expect(() => getTagTranslationChannel()).toThrow('指定翻译专用渠道');
  });
});
