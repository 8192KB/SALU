const MAX_EDGE = 1600;
const KEEP_BYTES = 1.5 * 1024 * 1024;
// 휴대폰 원본 사진은 계정 사진 용량을 금방 채우고 보내기도 느려 긴 변을 1,600px로 줄임. 기록 저장과 상담 전송에 씀.
// 줄이지 못하는 브라우저·파일은 원본을 보내고 크기·형식은 서버가 다시 검사함
export async function fitPhoto(blob: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return blob;
  }
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && blob.size <= KEEP_BYTES) return blob;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return blob;
    // JPEG에는 투명한 곳이 없어 흰 바탕에 그림(화면 색 토큰과 무관한 사진 내용)
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const fitted = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    );
    return fitted && fitted.size < blob.size ? fitted : blob;
  } finally {
    bitmap.close();
  }
}
