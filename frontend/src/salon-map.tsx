import { useEffect, useRef, useState } from 'react';
import { Alert } from './components';

// 미용실 위치(docs/development-contract.md `공개 미용실·디자이너`). 셋이 함께 있거나 함께 없음
export type SalonLocation = { address: string; latitude: number; longitude: number };
export const salonLocation = (value: {
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): SalonLocation | undefined =>
  value.address && value.latitude != null && value.longitude != null
    ? { address: value.address, latitude: value.latitude, longitude: value.longitude }
    : undefined;

// 카카오맵 JS 키는 공개되는 값이라 빌드 때 넣고 카카오 앱의 사이트 도메인으로 막음
const mapKey = import.meta.env.VITE_KAKAO_MAP_KEY as string | undefined;
export const mapAvailable = Boolean(mapKey);

type LatLng = object;
type KakaoMaps = {
  load: (callback: () => void) => void;
  LatLng: new (latitude: number, longitude: number) => LatLng;
  Map: new (element: HTMLElement, options: { center: LatLng; level: number }) => object;
  Marker: new (options: { map: object; position: LatLng }) => object;
  services: {
    Status: { OK: string };
    Geocoder: new () => {
      addressSearch: (
        address: string,
        callback: (result: { x: string; y: string }[], status: string) => void,
      ) => void;
    };
  };
};
type PostcodeData = { roadAddress: string; jibunAddress: string; sido: string; sigungu: string };
type Postcode = new (options: {
  oncomplete: (data: PostcodeData) => void;
  width: string;
  height: string;
}) => { embed: (element: HTMLElement) => void };
declare global {
  interface Window {
    kakao?: { maps: KakaoMaps };
    daum?: { Postcode: Postcode };
  }
}

// 외부 SDK 스크립트는 한 번만 넣음. 실패하면 지워 다음에 다시 시도함
const scripts = new Map<string, Promise<void>>();
export const loadScript = (src: string) => {
  let pending = scripts.get(src);
  if (!pending) {
    pending = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scripts.delete(src);
        script.remove();
        reject(new Error('script'));
      };
      document.head.append(script);
    });
    scripts.set(src, pending);
  }
  return pending;
};

async function kakaoMaps() {
  if (!mapKey) throw new Error('no key');
  await loadScript(
    `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(mapKey)}&libraries=services&autoload=false`,
  );
  const maps = window.kakao?.maps;
  if (!maps) throw new Error('sdk');
  await new Promise<void>((resolve) => maps.load(resolve));
  return maps;
}

const kakaoLink = (name: string, location: SalonLocation) =>
  `https://map.kakao.com/link/map/${encodeURIComponent(name)},${location.latitude},${location.longitude}`;

// 디자이너 상세의 매장 위치. 지도를 못 그려도 매장 이름·주소와 카카오맵 링크는 보임
export function SalonMap({ name, location }: { name: string; location: SalonLocation }) {
  const element = useRef<HTMLDivElement>(null);
  const [maps, setMaps] = useState<KakaoMaps>();
  useEffect(() => {
    if (!mapAvailable) return;
    let current = true;
    kakaoMaps().then(
      (loaded) => current && setMaps(loaded),
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, []);
  // 지도 칸은 SDK를 받은 뒤에야 높이가 생김. 높이가 0일 때 만들면 가운데가 맨 위로 잡히고 마커가 숨음
  useEffect(() => {
    if (!maps || !element.current) return;
    const center = new maps.LatLng(location.latitude, location.longitude);
    const map = new maps.Map(element.current, { center, level: 3 });
    new maps.Marker({ map, position: center });
  }, [maps, location.latitude, location.longitude]);
  return (
    <section className="consultation-soft-panel salon-map">
      <h2>매장 위치</h2>
      <div className="salon-map-place">
        <strong>{name}</strong>
        <p>{location.address}</p>
      </div>
      {mapAvailable && (
        <div
          ref={element}
          className="salon-map-canvas"
          data-drawn={maps ? true : undefined}
          role="img"
          aria-label={`${name} 위치 지도`}
        />
      )}
      <a className="text-link" href={kakaoLink(name, location)} target="_blank" rel="noreferrer">
        카카오맵에서 보기
      </a>
    </section>
  );
}

export type PickedAddress = SalonLocation & { region: string };

// 주소 검색(Daum 우편번호)으로 고른 도로명 주소를 카카오 Geocoder로 좌표로 바꿈
export function AddressSearch({
  onPick,
  onCancel,
}: {
  onPick: (value: PickedAddress) => void;
  onCancel: () => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    loadScript('https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js').then(
      () => {
        const Postcode = window.daum?.Postcode;
        if (!current || !element.current || !Postcode) return;
        new Postcode({
          width: '100%',
          height: '100%',
          oncomplete: (data) => {
            const address = data.roadAddress || data.jibunAddress;
            kakaoMaps()
              .then(
                (maps) =>
                  new Promise<PickedAddress>((resolve, reject) =>
                    new maps.services.Geocoder().addressSearch(address, (result, status) => {
                      const first = result[0];
                      if (status !== maps.services.Status.OK || !first) return reject();
                      resolve({
                        address,
                        latitude: Number(first.y),
                        longitude: Number(first.x),
                        region: [data.sido, data.sigungu].filter(Boolean).join(' '),
                      });
                    }),
                  ),
              )
              .then(
                (value) => current && onPick(value),
                () =>
                  current && setError('주소의 위치를 찾지 못했어요. 다른 주소로 검색해 주세요.'),
              );
          },
        }).embed(element.current);
      },
      () => current && setError('주소 검색을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.'),
    );
    return () => {
      current = false;
    };
  }, [onPick]);
  return (
    <div className="address-search">
      <div ref={element} className="address-search-frame" />
      {error && <Alert message={error} />}
      <button type="button" className="text-link" onClick={onCancel}>
        주소 검색 닫기
      </button>
    </div>
  );
}
