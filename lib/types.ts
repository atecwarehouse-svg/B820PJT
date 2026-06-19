import type { CustomSlot } from "@/lib/slots";

export interface Vehicle {
  plate: string;
  operator: string;
  route: string;
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
  updated_at?: string;
}

// 편집 화면이 받는 통합 데이터
export interface RecordBundle {
  vehicle: Vehicle | null;
  record: RecordRow | null;
  photos: PhotoRow[];
}
