// 진행현황 엑셀 양식(Supabase Storage) 위치 — 프로젝트별로 다른 객체 경로를 쓴다.
//   B820: templates/progress-template.xlsx (기존 그대로)
//   그 외: templates/<slug>/progress-template.xlsx  (첫 '일정 업로드'가 만든다)
import { isDefault } from "@/lib/project";

export const TEMPLATE_BUCKET = process.env.TEMPLATE_BUCKET ?? "templates";
const BASE_OBJECT = process.env.TEMPLATE_OBJECT ?? "progress-template.xlsx";

export function templateObject(slug: string): string {
  return isDefault(slug) ? BASE_OBJECT : `${slug}/${BASE_OBJECT}`;
}

/** 일정 업로드가 교체 전 보관하는 백업본 (같은 폴더, .backup.xlsx) */
export function templateBackup(slug: string): string {
  return templateObject(slug).replace(/\.xlsx$/, ".backup.xlsx");
}
