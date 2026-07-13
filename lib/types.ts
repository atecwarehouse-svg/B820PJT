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

// 차량 이상유무 확인 사진 (check_photos 테이블 — PDF/엑셀·KPI 집계 미포함)
export interface CheckPhotoRow {
  id: string;
  plate: string;
  slot_key: string;
  label: string;
  storage_path: string;
  sort_order: number;
  updated_at?: string;
}

export interface RecordRow {
  plate: string;
  install_date: string; // YYYY-MM-DD
  operator: string | null;
  route: string | null;
  year: string | null;
  model: string | null;
  team?: string | null; // 설치 팀명 (저장 시 필수)
  custom_slots: CustomSlot[];
  na_slots?: string[]; // 단말기 없음으로 표시한 슬롯키 (사진없이 충족 처리)
  check_na_slots?: string[]; // 차량 이상유무 '없음' 표시 슬롯키 (장비 미장착 차량)
  check_note?: string | null; // 차량 이상유무 비고
  extra_note?: string | null; // 설치 특이사항
  saved_at?: string | null;
  updated_at?: string;
}

// 편집 화면이 받는 통합 데이터
export interface RecordBundle {
  vehicle: Vehicle | null;
  record: RecordRow | null;
  photos: PhotoRow[];
  checkPhotos?: CheckPhotoRow[]; // 차량 이상유무 확인 사진 (마이그레이션 전 DB면 빈 배열)
}
