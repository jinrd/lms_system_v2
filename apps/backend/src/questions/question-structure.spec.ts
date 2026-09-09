import { describe, expect, it } from '@jest/globals';
import { QuestionType } from '../generated/prisma/enums';
import { checkQuestionStructure } from './question-structure';

describe('checkQuestionStructure (기획안 §12.1)', () => {
  describe('SINGLE_CHOICE', () => {
    const base = {
      type: QuestionType.SINGLE_CHOICE,
      acceptedAnswerCount: 0,
    };

    it('보기 2개 이상 + 정답 정확히 1개면 통과', () => {
      expect(
        checkQuestionStructure({
          ...base,
          optionCount: 4,
          correctOptionCount: 1,
        }),
      ).toBeNull();
    });

    it('보기가 1개면 거부', () => {
      expect(
        checkQuestionStructure({
          ...base,
          optionCount: 1,
          correctOptionCount: 1,
        }),
      ).toMatch(/2개 이상/);
    });

    it('정답 보기가 2개면 거부', () => {
      expect(
        checkQuestionStructure({
          ...base,
          optionCount: 4,
          correctOptionCount: 2,
        }),
      ).toMatch(/정확히 1개/);
    });

    it('허용 정답 목록이 있으면 거부', () => {
      expect(
        checkQuestionStructure({
          type: QuestionType.SINGLE_CHOICE,
          optionCount: 4,
          correctOptionCount: 1,
          acceptedAnswerCount: 1,
        }),
      ).toMatch(/허용 정답 목록/);
    });
  });

  describe('MULTIPLE_CHOICE', () => {
    it('보기 2개 이상 + 정답 1개 이상이면 통과', () => {
      expect(
        checkQuestionStructure({
          type: QuestionType.MULTIPLE_CHOICE,
          optionCount: 5,
          correctOptionCount: 3,
          acceptedAnswerCount: 0,
        }),
      ).toBeNull();
    });

    it('정답 보기가 0개면 거부', () => {
      expect(
        checkQuestionStructure({
          type: QuestionType.MULTIPLE_CHOICE,
          optionCount: 5,
          correctOptionCount: 0,
          acceptedAnswerCount: 0,
        }),
      ).toMatch(/1개 이상/);
    });
  });

  describe('SHORT_ANSWER', () => {
    it('보기 없음 + 허용 정답 1개 이상이면 통과', () => {
      expect(
        checkQuestionStructure({
          type: QuestionType.SHORT_ANSWER,
          optionCount: 0,
          correctOptionCount: 0,
          acceptedAnswerCount: 2,
        }),
      ).toBeNull();
    });

    it('보기가 있으면 거부', () => {
      expect(
        checkQuestionStructure({
          type: QuestionType.SHORT_ANSWER,
          optionCount: 2,
          correctOptionCount: 0,
          acceptedAnswerCount: 1,
        }),
      ).toMatch(/보기를 넣을 수 없/);
    });

    it('허용 정답이 없으면 거부', () => {
      expect(
        checkQuestionStructure({
          type: QuestionType.SHORT_ANSWER,
          optionCount: 0,
          correctOptionCount: 0,
          acceptedAnswerCount: 0,
        }),
      ).toMatch(/허용 정답이 최소 1개/);
    });
  });
});
