import { directoryRequest } from './auth/api';
import type { DesignerProfile } from './prototype/types';
export type Salon = { id: string; name: string; region: string; branch: string };
export type PublicProfile = {
  id: string;
  name: string;
  introduction: string;
  specialties: string;
  visibility: 'PUBLIC' | 'PRIVATE';
  salonId: string | null;
  salonName: string | null;
  region: string | null;
  branch: string | null;
  reviewCount: number;
  averageRating: number | null;
};
export const salonLabel = (salon: Salon) =>
  [salon.name, salon.branch, salon.region].filter(Boolean).join(' · ');
export function profileModel(profile: PublicProfile): DesignerProfile {
  return {
    id: profile.id,
    name: profile.name,
    introduction: profile.introduction,
    specialties: profile.specialties.split(',').filter(Boolean),
    salonId: profile.salonId ?? undefined,
    affiliations: profile.salonName
      ? [
          {
            salonName: [profile.salonName, profile.branch].filter(Boolean).join(' '),
            period: '현재 소속',
            current: true,
          },
        ]
      : [],
    reviewExamples: [],
    rating: { count: profile.reviewCount ?? 0, average: profile.averageRating ?? null },
  };
}
let snapshot: {
  designers: DesignerProfile[];
  salons: Salon[];
  loading: boolean;
  loaded: boolean;
  error: string;
} = { designers: [], salons: [], loading: false, loaded: false, error: '' };
const listeners = new Set<() => void>();
export const directorySnapshot = () => snapshot;
export const subscribeDirectory = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const publish = (next: typeof snapshot) => {
  snapshot = next;
  listeners.forEach((listener) => listener());
};
export const getPublicDesigner = (id?: string) =>
  snapshot.designers.find((profile) => profile.id === id);
export async function refreshDirectory() {
  if (snapshot.loading) return;
  publish({ ...snapshot, loading: true, error: '' });
  try {
    const [designers, salons] = await Promise.all([
      directoryRequest<PublicProfile[]>('/api/designers'),
      directoryRequest<Salon[]>('/api/salons'),
    ]);
    publish({
      designers: (designers ?? []).map(profileModel),
      salons: salons ?? [],
      loading: false,
      loaded: true,
      error: '',
    });
  } catch (error) {
    publish({
      ...snapshot,
      loading: false,
      loaded: true,
      error: error instanceof Error ? error.message : '목록을 불러오지 못했어요.',
    });
  }
}

const savedProfiles = new WeakMap<object, DesignerProfile>();
export function draftDesigner(
  designers: DesignerProfile[],
  draft?: {
    designerId?: string;
    designerSnapshot?: { id: string; name: string; salonName: string };
  } | null,
) {
  const profile = designers.find((value) => value.id === draft?.designerId);
  if (profile) return profile;
  const saved = draft?.designerSnapshot;
  if (!saved || saved.id !== draft?.designerId) return undefined;
  let previous = savedProfiles.get(saved);
  if (!previous) {
    previous = {
      id: saved.id,
      name: saved.name,
      introduction: '',
      specialties: [],
      affiliations: [{ salonName: saved.salonName, period: '선택 당시', current: true }],
      reviewExamples: [],
    };
    savedProfiles.set(saved, previous);
  }
  return previous;
}
