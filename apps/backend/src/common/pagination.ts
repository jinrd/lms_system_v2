import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * 목록 API의 페이지네이션 공통 규칙이다.
 *
 * 학생·강사·강의·반·시험·문제·출석·응시 결과·로그 등 목록을 반환하는 모든 API가
 * 같은 질의 파라미터와 같은 응답 형태를 사용한다. 검색·필터·정렬은 서버에서
 * 처리하고 클라이언트는 page와 limit만 넘긴다.
 */

/** 기본 페이지 크기다. */
export const DEFAULT_PAGE_SIZE = 20;

/** 한 번에 조회할 수 있는 최대 페이지 크기다. */
export const MAX_PAGE_SIZE = 100;

/** 목록 API가 공통으로 받는 페이지네이션 질의 파라미터다. */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit: number = DEFAULT_PAGE_SIZE;
}

/** 목록 응답에 함께 실리는 페이지 정보다. */
export interface PaginationMeta {
  /** 현재 페이지 번호다. 1부터 시작한다. */
  page: number;
  /** 페이지 크기다. */
  limit: number;
  /** 필터를 적용한 전체 행 수다. */
  total: number;
  /** 전체 페이지 수다. `ceil(total / limit)`이다. */
  totalPages: number;
}

/** 목록 API의 표준 응답 형태다. */
export interface PaginatedResult<T> {
  items: T[];
  pagination: PaginationMeta;
}

/** 질의 파라미터를 Prisma의 `skip`·`take`로 변환한다. */
export function toSkipTake(query: PaginationQueryDto): {
  skip: number;
  take: number;
} {
  const page = query.page ?? 1;
  const limit = query.limit ?? DEFAULT_PAGE_SIZE;

  return { skip: (page - 1) * limit, take: limit };
}

/**
 * 조회 결과와 전체 행 수로 표준 목록 응답을 만든다.
 *
 * `total`은 반드시 같은 필터를 적용한 `count` 결과여야 한다.
 */
export function buildPaginatedResult<T>(
  items: T[],
  total: number,
  query: PaginationQueryDto,
): PaginatedResult<T> {
  const page = query.page ?? 1;
  const limit = query.limit ?? DEFAULT_PAGE_SIZE;

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
    },
  };
}
