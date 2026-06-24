// 모바일 호환 파일 다운로드 유틸.
//
// 아이폰 사파리는 blob URL + a.download 를 무시해 파일이 받아지지 않고 화면에 열려버린다.
// 반면 서버가 'Content-Disposition: attachment' 로 내려주는 동일 출처 URL 은
// a[href] 직접 클릭만으로 iOS/안드로이드/PC 모두에서 안정적으로 다운로드된다.
// (attachment 응답이라 현재 페이지는 그대로 유지되고 파일만 받아진다.)
export function downloadUrl(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
