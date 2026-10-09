import { fixtures } from './fixtures';
import { today, validDate } from './dates';
import { AREAS, INTENTS } from './types';
import type {
  ConsultationDraft,
  CutDraft,
  PhotoDraft,
  ProgressDraft,
  PrototypeRepository,
  PrototypeState,
} from './types';

export class InputError extends Error {
  constructor(public fields: Record<string, string>) {
    super(Object.values(fields)[0]);
  }
}
export function newCutDraft(): CutDraft {
  return {
    cutDate: today(),
    service: '커트',
    areas: [],
    goodNote: '',
    salonName: '',
    designerName: '',
    price: '',
    photos: [],
  };
}
export function newProgressDraft(): ProgressDraft {
  return { observedOn: today(), areas: [], discomfort: '', styling: '', question: '', photos: [] };
}
const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const checkAreas = (values: string[]) =>
  values.length > 0 && values.every((value) => value in AREAS);
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export function createMemoryRepository(): PrototypeRepository {
  let state: PrototypeState = fixtures();
  let generation = 0;
  const listeners = new Set<() => void>();
  const urls = new Set<string>();
  const publish = (next: PrototypeState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  const release = (url: string) => {
    if (urls.delete(url)) URL.revokeObjectURL(url);
  };
  const assertPhotos = (photos: PhotoDraft[]) => {
    if (photos.length > 6 || photos.some((photo) => !urls.has(photo.url)))
      throw new InputError({ photos: '사진을 다시 선택해 주세요.' });
  };

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async load() {},
    async createCut(input) {
      const fields: Record<string, string> = {};
      if (!validDate(input.cutDate) || input.cutDate > today())
        fields.cutDate = '오늘까지의 올바른 커트 날짜를 선택해 주세요.';
      if (!input.service.trim()) fields.service = '시술을 입력해 주세요.';
      if (!checkAreas(input.areas)) fields.areas = '부위를 하나 이상 선택해 주세요.';
      if (input.price && (!/^\d+$/.test(input.price) || !Number.isSafeInteger(Number(input.price))))
        fields.price = '가격은 0 이상의 정수로 입력해 주세요.';
      if (Object.keys(fields).length) throw new InputError(fields);
      assertPhotos(input.photos);
      const cut = {
        id: id('cut'),
        cutDate: input.cutDate,
        service: input.service.trim(),
        areas: [...new Set(input.areas)],
        goodNote: input.goodNote.trim(),
        salonName: input.salonName.trim(),
        designerName: input.designerName.trim(),
        price: input.price ? Number(input.price) : undefined,
      };
      const photos = input.photos.map((photo) => ({ ...photo, cutId: cut.id, date: cut.cutDate }));
      publish({ ...state, cuts: [cut, ...state.cuts], photos: [...state.photos, ...photos] });
      return cut;
    },
    async addProgress(cutId, input) {
      const cut = state.cuts.find((value) => value.id === cutId);
      if (!cut)
        throw new InputError({ form: '커트 기록이 없어졌습니다. 내 기록에서 다시 시작해 주세요.' });
      const fields: Record<string, string> = {};
      if (
        !validDate(input.observedOn) ||
        input.observedOn < cut.cutDate ||
        input.observedOn > today()
      )
        fields.observedOn = '커트 날짜부터 오늘 사이의 관찰 날짜를 선택해 주세요.';
      if (!checkAreas(input.areas)) fields.areas = '관찰한 부위를 선택해 주세요.';
      if (![input.discomfort, input.styling, input.question].some((value) => value.trim()))
        fields.discomfort = '불편한 점, 손질, 질문 중 하나 이상 적어 주세요.';
      if (Object.keys(fields).length) throw new InputError(fields);
      assertPhotos(input.photos);
      const entry = {
        id: id('progress'),
        cutId,
        observedOn: input.observedOn,
        areas: [...new Set(input.areas)],
        discomfort: input.discomfort.trim(),
        styling: input.styling.trim(),
        question: input.question.trim(),
      };
      const photos = input.photos.map((photo) => ({
        ...photo,
        cutId,
        progressId: entry.id,
        date: entry.observedOn,
      }));
      publish({
        ...state,
        progress: [...state.progress, entry],
        photos: [...state.photos, ...photos],
      });
      return entry;
    },
    async createPreview(draft: ConsultationDraft) {
      const cut = state.cuts.find((value) => value.id === draft.cutId);
      const designer = state.designers.find((value) => value.id === draft.designerId);
      if (!cut || !designer)
        throw new InputError({ form: '기록과 디자이너를 다시 선택해 주세요.' });
      const progress = draft.progressIds.map((value) =>
        state.progress.find((entry) => entry.id === value && entry.cutId === cut.id),
      );
      const photos = draft.photoIds.map((value) =>
        state.photos.find((photo) => photo.id === value && photo.cutId === cut.id),
      );
      if (
        progress.some((value) => !value) ||
        photos.some((value) => !value) ||
        (draft.includeGoodNote && !cut.goodNote)
      )
        throw new InputError({
          materials: '선택한 자료를 찾을 수 없습니다. 자료를 다시 확인해 주세요.',
        });
      if (!draft.includeGoodNote && !progress.length && !photos.length)
        throw new InputError({ materials: '상담에 사용할 자료를 하나 이상 선택해 주세요.' });
      if (
        !draft.requests.length ||
        draft.requests.some(
          (item) => !(item.area in AREAS) || !(item.intent in INTENTS) || !item.content.trim(),
        )
      )
        throw new InputError({ requests: '부위별 요청 내용을 모두 적어 주세요.' });
      const preview = structuredClone({
        id: id('preview'),
        createdAt: new Date().toISOString(),
        designer: {
          id: designer.id,
          name: designer.name,
          salonName: designer.affiliations.find((value) => value.current)?.salonName ?? '',
        },
        cut: { id: cut.id, cutDate: cut.cutDate, service: cut.service, areas: cut.areas },
        goodNote: draft.includeGoodNote ? cut.goodNote : undefined,
        progress: progress.filter((value) => value !== undefined),
        photos: photos.filter((value) => value !== undefined),
        requests: draft.requests.map((item) => ({ ...item, content: item.content.trim() })),
        homeStyling: draft.homeStyling.trim(),
        additionalQuestion: draft.additionalQuestion.trim(),
        sourceDraft: draft,
      });
      publish({ ...state, previews: [...state.previews, preview] });
      return preview;
    },
    async preparePhotos(files, existingCount) {
      const start = generation;
      if (existingCount + files.length > 6)
        throw new InputError({ photos: '사진은 한 번에 최대 6장까지 선택할 수 있습니다.' });
      if (
        files.some(
          (file) =>
            !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
            file.size > MAX_PHOTO_BYTES ||
            !file.size,
        )
      )
        throw new InputError({ photos: '5 MiB 이하의 JPEG·PNG·WebP 사진을 선택해 주세요.' });
      const prepared: PhotoDraft[] = [];
      try {
        for (const file of files) {
          const url = URL.createObjectURL(file);
          urls.add(url);
          const photo = { id: id('photo'), url, caption: file.name };
          prepared.push(photo);
          const image = new Image();
          image.src = url;
          await image.decode();
          if (start !== generation) throw new Error('reset');
        }
        return prepared;
      } catch {
        prepared.forEach((photo) => release(photo.url));
        throw new InputError({
          photos: '사진을 읽을 수 없습니다. 실제 이미지 파일을 다시 선택해 주세요.',
        });
      }
    },
    releasePhoto(photo) {
      release(photo.url);
    },
    reset() {
      generation++;
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
      publish(fixtures());
    },
    dispose() {
      generation++;
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    },
  };
}
