import { daysAfter } from './dates';
import type {
  Area,
  CutRecord,
  Intent,
  PrototypeState,
  RecordPhoto,
  RequestDraft,
  RequestItem,
  RequestPreview,
} from './types';

export function newRequest(area: Area = 'SIDE', intent: Intent = 'ASK', content = ''): RequestItem {
  return { id: crypto.randomUUID(), area, intent, content };
}
export function newRequestDraft(cutId: string, designerId?: string): RequestDraft {
  return {
    id: crypto.randomUUID(),
    cutId,
    designerId,
    includeGoodNote: false,
    progressIds: [],
    photoIds: [],
    requests: [newRequest()],
    homeStyling: '',
    additionalQuestion: '',
  };
}
export function draftFromPreview(
  preview: RequestPreview,
  designerId = preview.designer?.id,
): RequestDraft {
  return {
    ...structuredClone(preview.sourceDraft),
    id: crypto.randomUUID(),
    designerId,
    referencePreviewId: preview.id,
  };
}
export function requestTarget(draft: Pick<RequestDraft, 'cutId' | 'designerId'>) {
  return JSON.stringify([draft.designerId ?? null, draft.cutId]);
}
export function materialUrl(draft: Pick<RequestDraft, 'id'>) {
  return `/requests/materials?draft=${encodeURIComponent(draft.id)}`;
}
export function requestUrl(draft: Pick<RequestDraft, 'id'>) {
  return `/requests/write?draft=${encodeURIComponent(draft.id)}`;
}
export function previewUrl(preview: Pick<RequestPreview, 'id'>) {
  return `/requests/previews/${encodeURIComponent(preview.id)}`;
}
export function selectedCount(draft: RequestDraft) {
  return Number(draft.includeGoodNote) + draft.progressIds.length + draft.photoIds.length;
}
export function photoOrigin(photo: RecordPhoto, cutDate: string) {
  return photo.progressId ? `경과 D+${daysAfter(cutDate, photo.date)}` : '커트 당일';
}
export function hasDraftContent(draft: RequestDraft) {
  return Boolean(
    selectedCount(draft) ||
    draft.requests.some((item) => item.content.trim()) ||
    draft.homeStyling.trim() ||
    draft.additionalQuestion.trim(),
  );
}
export function unfinishedDrafts(state: PrototypeState, drafts: Record<string, RequestDraft>) {
  return Object.values(drafts)
    .filter(
      (draft) =>
        hasDraftContent(draft) &&
        !state.previews.some(
          (preview) => JSON.stringify(preview.sourceDraft) === JSON.stringify(draft),
        ),
    )
    .reverse();
}
export function materialSource(state: PrototypeState, draft: RequestDraft) {
  if (draft.referencePreviewId) {
    const preview = state.previews.find(
      (value) => value.id === draft.referencePreviewId && value.cut.id === draft.cutId,
    );
    if (!preview) return null;
    return {
      cut: { ...preview.cut, goodNote: preview.goodNote ?? '' },
      progress: preview.progress,
      photos: preview.photos,
      frozen: true,
    };
  }
  const cut = state.cuts.find((value) => value.id === draft.cutId);
  if (!cut) return null;
  return {
    cut: cut as Pick<CutRecord, 'id' | 'cutDate' | 'service' | 'areas' | 'goodNote'>,
    progress: state.progress.filter((value) => value.cutId === cut.id),
    photos: state.photos.filter((value) => value.cutId === cut.id),
    frozen: false,
  };
}
export function latestMaterials(state: PrototypeState, draft: RequestDraft): RequestDraft {
  const cut = state.cuts.find((value) => value.id === draft.cutId);
  return {
    ...draft,
    referencePreviewId: undefined,
    includeGoodNote: draft.includeGoodNote && Boolean(cut?.goodNote),
    progressIds: draft.progressIds.filter((id) =>
      state.progress.some((entry) => entry.id === id && entry.cutId === draft.cutId),
    ),
    photoIds: draft.photoIds.filter((id) =>
      state.photos.some((photo) => photo.id === id && photo.cutId === draft.cutId),
    ),
  };
}
