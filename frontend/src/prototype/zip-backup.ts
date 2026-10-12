import { zip, unzip, strToU8, strFromU8 } from 'fflate';
import { photoIds, serialize, validateBundle } from './storage-model';
import type { Asset, Bundle } from './storage-model';

const LIMIT = 128 * 1024 * 1024;
const digest = async (bytes: Uint8Array) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
const MIME = ['image/jpeg', 'image/png', 'image/webp'];
export async function checkImage(blob: Blob) {
  if (!MIME.includes(blob.type) || !blob.size || blob.size > 5 * 1024 * 1024)
    throw new Error('image size/type');
  const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const matches =
    blob.type === 'image/jpeg'
      ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : blob.type === 'image/png'
        ? bytes.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10'
        : strFromU8(bytes.slice(0, 4)) === 'RIFF' && strFromU8(bytes.slice(8, 12)) === 'WEBP';
  if (!matches) throw new Error('image signature');
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function exportZip(bundle: Bundle, assets: Map<string, Blob>): Promise<Blob> {
  const entries: Record<string, Uint8Array> = {};
  const manifest: { id: string; path: string; type: string; size: number; sha256: string }[] = [];
  for (const id of photoIds(bundle)) {
    const blob = assets.get(id);
    if (!blob) throw new Error('사진을 읽지 못했어요. 백업을 다시 시도해 주세요.');
    const path = `photos/${id}`;
    entries[path] = new Uint8Array(await blob.arrayBuffer());
    manifest.push({
      id,
      path,
      type: blob.type,
      size: blob.size,
      sha256: await digest(entries[path]),
    });
  }
  entries['records.json'] = strToU8(JSON.stringify(serialize(bundle)));
  entries['manifest.json'] = strToU8(
    JSON.stringify({
      format: 'salu-personal-backup',
      version: 1,
      createdAt: new Date().toISOString(),
      recordsSha256: await digest(entries['records.json']),
      photos: manifest,
    }),
  );
  if (Object.values(entries).reduce((n, entry) => n + entry.length, 0) > LIMIT)
    throw new Error('백업은 한 파일에 128 MiB까지 지원합니다.');
  const data = await new Promise<Uint8Array>((resolve, reject) =>
    zip(entries, { level: 0 }, (error, result) => (error ? reject(error) : resolve(result))),
  );
  return new Blob([data as Uint8Array<ArrayBuffer>], { type: 'application/zip' });
}
export async function importZip(file: File): Promise<{ bundle: Bundle; assets: Asset[] }> {
  if (!file.size || file.size > LIMIT)
    throw new Error('128 MiB 이하의 SALU 백업 파일을 선택해 주세요.');
  try {
    let total = 0;
    const paths = new Set<string>();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) =>
      unzip(
        bytes,
        {
          filter: (info) => {
            total += info.originalSize;
            if (
              paths.has(info.name) ||
              paths.size >= 512 ||
              total > LIMIT ||
              !Number.isSafeInteger(total) ||
              !/^(manifest\.json|records\.json|photos\/[A-Za-z0-9_-]{1,100})$/.test(info.name)
            )
              throw new Error('archive limits');
            paths.add(info.name);
            return true;
          },
        },
        (error, result) => (error ? reject(error) : resolve(result)),
      ),
    );
    if (
      !entries['manifest.json'] ||
      !entries['records.json'] ||
      entries['records.json'].length > 8 * 1024 * 1024 ||
      entries['manifest.json'].length > 128 * 1024
    )
      throw new Error('manifest');
    const manifest = JSON.parse(strFromU8(entries['manifest.json']));
    if (
      manifest.format !== 'salu-personal-backup' ||
      manifest.version !== 1 ||
      !Array.isArray(manifest.photos)
    )
      throw new Error('version');
    if (manifest.recordsSha256 !== (await digest(entries['records.json'])))
      throw new Error('records checksum');
    const bundle = validateBundle(JSON.parse(strFromU8(entries['records.json'])));
    const ids = new Set(photoIds(bundle));
    const assets: Asset[] = [];
    for (const photo of manifest.photos) {
      if (
        !photo ||
        !ids.delete(photo.id) ||
        photo.path !== `photos/${photo.id}` ||
        !entries[photo.path] ||
        photo.size !== entries[photo.path].length ||
        !MIME.includes(photo.type)
      )
        throw new Error('photo manifest');
      if (photo.sha256 !== (await digest(entries[photo.path]))) throw new Error('photo checksum');
      const blob = new Blob([entries[photo.path] as Uint8Array<ArrayBuffer>], { type: photo.type });
      await checkImage(blob);
      assets.push({ id: photo.id, blob });
    }
    if (ids.size || paths.size !== assets.length + 2) throw new Error('missing or extra photo');
    return { bundle, assets };
  } catch {
    throw new Error(
      '백업 파일이 손상됐거나 지원하지 않는 형식이에요. 다른 파일을 선택해 주세요. 기존 기록은 그대로 있어요.',
    );
  }
}
