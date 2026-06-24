import type { CustomSlot } from "@/lib/slots";

export interface Vehicle {
  plate: string;
  operator: string;
  route: string;
  year?: string | null; // 연식 마스터 (차량리스트 J열) — 기본값용
  model?: string | null; // 모델명 마스터 (차량리스트 L열) — 기본값용
}

export interface PhotoRow {
  id: string;
  plate: string;
  section: "before" | "after";
  slot_key: string;
  label: string;
  storage_path: string;
  sort_order: number;
  is_custom: boolean;
  updated_at?: string;
}

export interface RecordRow {
  plate: string;
  install_date: string; // YYYY-MM-DD
  operator: string | null;
  route: string | null;
  year: string | null;
  model: string | null;
  custom_slots: CustomSlot[];
  saved_at?: string | null;
  updated_at?: string;
}

// 편집 화면이 받는 통합 데이터
export interface RecordBundle {
  vehicle: Vehicle | null;
  record: RecordRow | null;
  photos: PhotoRow[];
}
