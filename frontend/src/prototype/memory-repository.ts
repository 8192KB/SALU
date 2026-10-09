import { fixtures } from './fixtures';
import { today, validDate } from './dates';
import { AREAS, INTENTS } from './types';
import { draftFromPreview, materialSource, selectedCount } from './request-flow';
import type {
  RequestDraft,
  CutRecord,
  CutDraft,
  PhotoDraft,
  ProgressDraft,
  ProgressEntry,
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
  values.length > 0 && values.every((value) => Object.hasOwn(AREAS, value));
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
  const cutValues = (input: Omit<CutDraft, 'photos'>, cutId?: string) => {
    const fields: Record<string, string> = {};
    if (!validDate(input.cutDate) || input.cutDate > today())
      fields.cutDate = '오늘까지의 올바른 커트 날짜를 선택해 주세요.';
    else if (
      cutId &&
      state.progress.some((entry) => entry.cutId === cutId && entry.observedOn < input.cutDate)
    )
      fields.cutDate = '이미 남긴 경과 날짜보다 늦은 커트 날짜로 바꿀 수 없습니다.';
    if (!input.service.trim()) fields.service = '시술을 입력해 주세요.';
    if (!checkAreas(input.areas)) fields.areas = '부위를 하나 이상 선택해 주세요.';
    if (input.price && (!/^\d+$/.test(input.price) || !Number.isSafeInteger(Number(input.price))))
      fields.price = '가격은 0 이상의 정수로 입력해 주세요.';
    const designer = state.designers.find((value) => value.id === input.designerProfileId);
    if (input.designerProfileId && !designer)
      fields.designerProfileId = '연결할 디자이너 프로필을 다시 선택해 주세요.';
    if (Object.keys(fields).length) throw new InputError(fields);
    return {
      cutDate: input.cutDate,
      service: input.service.trim(),
      areas: [...new Set(input.areas)],
      goodNote: input.goodNote.trim(),
      salonName: input.salonName.trim(),
      designerName: designer?.name ?? input.designerName.trim(),
      designerProfileId: designer?.id,
      price: input.price ? Number(input.price) : undefined,
    };
  };
  const progressValues = (cut: CutRecord, input: Omit<ProgressDraft, 'photos'>) => {
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
    return {
      observedOn: input.observedOn,
      areas: [...new Set(input.areas)],
      discomfort: input.discomfort.trim(),
      styling: input.styling.trim(),
      question: input.question.trim(),
    };
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
      const values = cutValues(input);
      assertPhotos(input.photos);
      const cut: CutRecord = { id: id('cut'), ...values };
      const photos = input.photos.map((photo) => ({ ...photo, cutId: cut.id, date: cut.cutDate }));
      publish({ ...state, cuts: [cut, ...state.cuts], photos: [...state.photos, ...photos] });
      return cut;
    },
    async updateCut(cutId, input) {
      if (!state.cuts.some((cut) => cut.id === cutId))
        throw new InputError({ form: '커트 기록을 찾을 수 없습니다.' });
      const cut: CutRecord = { id: cutId, ...cutValues(input, cutId) };
      publish({
        ...state,
        cuts: state.cuts.map((value) => (value.id === cutId ? cut : value)),
        photos: state.photos.map((photo) =>
          photo.cutId === cutId && !photo.progressId ? { ...photo, date: cut.cutDate } : photo,
        ),
      });
      return cut;
    },
    async addProgress(cutId, input) {
      const cut = state.cuts.find((value) => value.id === cutId);
      if (!cut)
        throw new InputError({ form: '커트 기록이 없어졌습니다. 내 기록에서 다시 시작해 주세요.' });
      const values = progressValues(cut, input);
      assertPhotos(input.photos);
      const entry: ProgressEntry = { id: id('progress'), cutId, ...values };
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
    async updateProgress(cutId, progressId, input) {
      const cut = state.cuts.find((value) => value.id === cutId);
      const original = state.progress.find(
        (value) => value.id === progressId && value.cutId === cutId,
      );
      if (!cut || !original)
        throw new InputError({ form: '이 커트의 경과 기록을 찾을 수 없습니다.' });
      const entry: ProgressEntry = { id: progressId, cutId, ...progressValues(cut, input) };
      publish({
        ...state,
        progress: state.progress.map((value) => (value.id === progressId ? entry : value)),
        photos: state.photos.map((photo) =>
          photo.cutId === cutId && photo.progressId === progressId
            ? { ...photo, date: entry.observedOn }
            : photo,
        ),
      });
      return entry;
    },
    async createPreview(draft: RequestDraft) {
      const source = materialSource(state, draft);
      const designer = state.designers.find((value) => value.id === draft.designerId);
      if (!source || (draft.designerId && !designer))
        throw new InputError({ form: '기록과 디자이너를 다시 선택해 주세요.' });
      const cut = source.cut;
      const progress = draft.progressIds.map((value) =>
        source.progress.find((entry) => entry.id === value && entry.cutId === cut.id),
      );
      const photos = draft.photoIds.map((value) =>
        source.photos.find((photo) => photo.id === value && photo.cutId === cut.id),
      );
      if (
        progress.some((value) => !value) ||
        photos.some((value) => !value) ||
        (draft.includeGoodNote && !cut.goodNote)
      )
        throw new InputError({
          materials: '선택한 자료를 찾을 수 없습니다. 자료를 다시 확인해 주세요.',
        });
      if (designer && !draft.includeGoodNote && !progress.length && !photos.length)
        throw new InputError({ materials: '상담에 사용할 자료를 하나 이상 선택해 주세요.' });
      if (
        !draft.requests.length ||
        draft.requests.some(
          (item) =>
            !Object.hasOwn(AREAS, item.area) ||
            !Object.hasOwn(INTENTS, item.intent) ||
            !item.content.trim(),
        )
      )
        throw new InputError({ requests: '부위별 요청 내용을 모두 적어 주세요.' });
      const preview = structuredClone({
        id: id('preview'),
        createdAt: new Date().toISOString(),
        designer: designer
          ? {
              id: designer.id,
              name: designer.name,
              salonName: designer.affiliations.find((value) => value.current)?.salonName ?? '',
            }
          : undefined,
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
    async createPreviewForDesigner(previewId, designerId) {
      const source = state.previews.find((value) => value.id === previewId);
      const designer = state.designers.find((value) => value.id === designerId);
      if (!source || !designer)
        throw new InputError({ form: '요청 자료와 디자이너를 다시 선택해 주세요.' });
      if (!selectedCount(source.sourceDraft))
        throw new InputError({ materials: '상담에 사용할 자료를 하나 이상 선택해 주세요.' });
      const preview = structuredClone({
        ...source,
        id: id('preview'),
        createdAt: new Date().toISOString(),
        designer: {
          id: designer.id,
          name: designer.name,
          salonName: designer.affiliations.find((value) => value.current)?.salonName ?? '',
        },
        sourceDraft: draftFromPreview(source, designer.id),
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
