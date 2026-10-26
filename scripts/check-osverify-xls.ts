// OS업데이트 검증 파일 4종 파서 점검 — npx tsx scripts/check-osverify-xls.ts <fault.xls> <b710.xls> <b700.xls> <b800.xls>
// 각 파일의 행 수·완료 조건 충족 수·예시를 출력한다.
import { readFileSync } from "node:fs";
import { OS_FILE_LABEL, OS_FILE_TYPES, parseOsFile } from "../lib/import/parse-osverify";

const paths = process.argv.slice(2);
if (paths.length !== 4) throw new Error("사용법: npx tsx scripts/check-osverify-xls.ts <장애목록.xls> <B710.xls> <B700.xls> <B800.xls>");
OS_FILE_TYPES.forEach((t, i) => {
  const rows = parseOsFile(readFileSync(paths[i]), t);
  const ok = rows.filter((r) => r.ok);
  console.log(`${OS_FILE_LABEL[t]}: 차량 ${rows.length}대 · 완료 ${ok.length}대 · 예 ${JSON.stringify(ok[0] ?? rows[0])}`);
});
console.log("OK");
