import { describe, expect, it } from '@jest/globals';
import {
  buildPaginatedResult,
  DEFAULT_PAGE_SIZE,
  toSkipTake,
} from './pagination';

describe('toSkipTake', () => {
  it('1페이지는 skip 0', () => {
    expect(toSkipTake({ page: 1, limit: 20 })).toEqual({ skip: 0, take: 20 });
  });

  it('3페이지, 크기 20이면 skip 40', () => {
    expect(toSkipTake({ page: 3, limit: 20 })).toEqual({ skip: 40, take: 20 });
  });

  it('값이 없으면 1페이지·기본 크기', () => {
    expect(toSkipTake({} as never)).toEqual({
      skip: 0,
      take: DEFAULT_PAGE_SIZE,
    });
  });
});

describe('buildPaginatedResult', () => {
  it('totalPages = ceil(total / limit)', () => {
    const r = buildPaginatedResult([], 101, { page: 1, limit: 20 });
    expect(r.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 101,
      totalPages: 6,
    });
  });

  it('total 0이면 totalPages 0', () => {
    expect(
      buildPaginatedResult([], 0, { page: 1, limit: 20 }).pagination.totalPages,
    ).toBe(0);
  });

  it('items를 그대로 싣는다', () => {
    const items = [{ id: 'a' }, { id: 'b' }];
    expect(buildPaginatedResult(items, 2, { page: 1, limit: 20 }).items).toBe(
      items,
    );
  });
});
