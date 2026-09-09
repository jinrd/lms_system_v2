import { describe, expect, it } from '@jest/globals';
import { exactSetMatch } from './exact-set-match';

describe('exactSetMatch (기획안 §8.2·D-24 복수 선택 채점)', () => {
  it('같은 원소면 순서가 달라도 일치', () => {
    expect(exactSetMatch(['a', 'b', 'c'], ['c', 'a', 'b'])).toBe(true);
  });

  it('정답 일부만 선택하면 불일치 (부분 점수 없음)', () => {
    expect(exactSetMatch(['a', 'b'], ['a', 'b', 'c'])).toBe(false);
  });

  it('오답 보기를 하나 더 추가하면 불일치', () => {
    expect(exactSetMatch(['a', 'b', 'c', 'd'], ['a', 'b', 'c'])).toBe(false);
  });

  it('둘 다 비어 있으면 일치', () => {
    expect(exactSetMatch([], [])).toBe(true);
  });

  it('한쪽만 비어 있으면 불일치', () => {
    expect(exactSetMatch(['a'], [])).toBe(false);
  });

  it('중복은 무시한다', () => {
    expect(exactSetMatch(['a', 'a', 'b'], ['b', 'a'])).toBe(true);
  });
});
