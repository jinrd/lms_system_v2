import { describe, expect, it } from '@jest/globals';
import {
  ANSWER_NORMALIZATION_VERSION,
  matchesAcceptedAnswer,
  normalizeAnswer,
} from './answer-normalizer';

describe('normalizeAnswer', () => {
  it('앞뒤 공백을 제거한다', () => {
    expect(normalizeAnswer('  정답  ')).toBe('정답');
  });

  it('연속된 공백을 한 칸으로 축약한다', () => {
    expect(normalizeAnswer('  Hello   World ')).toBe('hello world');
  });

  it('탭과 줄바꿈, 전각 공백도 공백으로 처리한다', () => {
    expect(normalizeAnswer('산화\t환원\n반응')).toBe('산화 환원 반응');
    expect(normalizeAnswer('산화　환원')).toBe('산화 환원');
  });

  it('영문 대소문자를 통일한다', () => {
    expect(normalizeAnswer('OhM')).toBe('ohm');
  });

  it('자소 분리된 한글을 NFC로 통일한다', () => {
    const decomposed = '정답'.normalize('NFD');

    expect(decomposed).not.toBe('정답');
    expect(normalizeAnswer(decomposed)).toBe('정답');
  });

  it('공백만 있는 문자열은 빈 문자열이 된다', () => {
    expect(normalizeAnswer('   ')).toBe('');
    expect(normalizeAnswer('')).toBe('');
  });

  it('규칙 버전은 1이다', () => {
    expect(ANSWER_NORMALIZATION_VERSION).toBe(1);
  });
});

describe('matchesAcceptedAnswer', () => {
  const accepted = ['옴의 법칙', 'ohm law'];

  it('정규화 후 완전히 일치하면 정답이다', () => {
    expect(matchesAcceptedAnswer('  옴의   법칙 ', accepted)).toBe(true);
    expect(matchesAcceptedAnswer('OHM  LAW', accepted)).toBe(true);
  });

  it('정답 단어를 포함하기만 하면 정답이 아니다', () => {
    expect(matchesAcceptedAnswer('옴의 법칙이다', accepted)).toBe(false);
    expect(matchesAcceptedAnswer('법칙', accepted)).toBe(false);
  });

  it('빈 답안은 정답이 아니다', () => {
    expect(matchesAcceptedAnswer('   ', accepted)).toBe(false);
    expect(matchesAcceptedAnswer('   ', [''])).toBe(false);
  });
});
