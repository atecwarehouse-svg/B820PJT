"use client";

import imageCompression from "browser-image-compression";

// 모바일 촬영 사진을 업로드 전 압축 (EXIF 회전 자동 보정 포함).
export async function compressImage(file: File): Promise<File> {
  try {
    const compressed = await imageCompression(file, {
      maxSizeMB: 0.8,
      maxWidthOrHeight: 1600,
      useWebWorker: true,
      fileType: "image/jpeg",
      initialQuality: 0.8,
    });
    // 항상 .jpg 이름으로 정규화
    return new File([compressed], "photo.jpg", { type: "image/jpeg" });
  } catch {
    // 압축 실패 시 원본 그대로 업로드
    return file;
  }
}
