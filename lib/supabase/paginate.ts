// Supabase REST는 요청당 1,000행 제한이 있어, range로 끝까지 모아오는 헬퍼.
// makeQuery(from, to)는 .range(from, to)가 적용된 쿼리(빌더)를 반환한다.

const PAGE = 1000;

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
