// Supabase REST는 요청당 행수 제한(max-rows)이 있어, range로 끝까지 모아오는 헬퍼.
// makeQuery(from, to)는 .range(from, to)가 적용된 쿼리(빌더)를 반환한다.
// 주의: 페이지마다 별도 쿼리이므로 호출부는 반드시 고유 컬럼 .order()를 걸어야 한다.
// 정렬이 없으면 페이지 사이에 행이 겹치거나 빠져 집계가 어긋날 수 있다(2026-07-21 수정).

const PAGE = 1000;

// in() 필터는 GET 쿼리스트링이라 한글 차량번호를 많이 담으면 URL 길이 초과로
// "fetch failed"가 난다(2026-07-10 실사례). 반드시 이 크기로 나눠 보낼 것.
export const PLATE_CHUNK = 100;

export function chunk<T>(arr: T[], size = PLATE_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function fetchAll<T>(
  makeQuery: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await makeQuery(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}
