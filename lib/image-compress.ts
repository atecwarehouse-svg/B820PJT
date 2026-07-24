"use client";

import imageCompression from "browser-image-compression";

// 모바일 촬영 사진을 업로드 전 압축 (EXIF 회전 자동 보정 포함).
export async function compressImage(file: File): Promise<File> {
  try {
    const compressed = await imageCompression(file, {
      // 고압축: 용량 절감 우선 (장비 식별 가능 수준 유지)
      maxSizeMB: 0.35,
      maxWidthOrHeight: 1024,
      useWebWorker: true,
      fileType: "image/jpeg",
      initialQuality: 0.6,
    });
    // 항상 .jpg 이름으로 정규화
    return new File([compressed], "photo.jpg", { type: "image/jpeg" });
  } catch {
    // 압축 실패 시: 브라우저가 표시할 수 있는 형식이면 원본 그대로 업로드.
    // HEIC 등 디코딩 불가 형식은 서버가 JPEG로 간주해 저장하면 모든 화면·PDF에서
    // 깨진 사진이 되므로(그리고 캐시에 굳음) 업로드를 막고 다시 촬영을 안내한다.
    if (["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      return file;
    }
    throw new Error(
      "사진 형식을 변환하지 못했습니다. 카메라 설정을 '높은 호환성(JPEG)'으로 바꾸거나 다시 촬영해주세요.",
    );
  }
}
