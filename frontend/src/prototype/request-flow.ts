import { getPublicDesigner } from '../directory-cache';
import { newId } from './ids';
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
  return { id: newId(), area, intent, content };
}
export function newRequestDraft(cutId: string, designerId?: string): RequestDraft {
  const designer = getPublicDesigner(designerId);
  return {
    id: newId(),
    cutId,
    designerId,
    designerSnapshot: designer
      ? {
          id: designer.id,
          name: designer.name,
          salonName: designer.affiliations.find((value) => value.current)?.salonName ?? '',
        }
      : undefined,
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
    id: newId(),
    designerId,
    designerSnapshot:
      newRequestDraft(preview.cut.id, designerId).designerSnapshot ??
      (designerId === preview.designer?.id ? preview.designer : undefined),
    referencePreviewId: preview.id,
  };
}
// 저장한 준비를 고치는 초안. 준비 ID를 초안 ID로 써서 어느 준비를 고치는지 저장 형식을 바꾸지 않고 잇고,
// 기록 복사(copyBundle)에서도 준비와 같은 새 ID로 바뀌어 연결이 유지됨.
// 자료는 그 준비에 담아 둔 것으로 시작함. 기록이 바뀌었어도 고치면서 몰래 바뀌지 않고, 최신 기록은 직접 골라 담음
export function editDraft(preview: RequestPreview): RequestDraft {
  return {
    ...structuredClone(preview.sourceDraft),
    id: preview.id,
    referencePreviewId: preview.id,
  };
}
export function isEditDraft(
  state: Pick<PrototypeState, 'previews'>,
  draft: Pick<RequestDraft, 'id'>,
) {
  return state.previews.some((preview) => preview.id === draft.id);
}
// 준비를 고친 뒤 준비 초안 정리
// - 고치기 전 준비와 같던 초안(그 준비를 만든 초안)은 지움. 남겨 두면 저장하지 않은 초안으로 보임
// - 고친 준비의 자료를 참고하던 초안은 고친 뒤에도 남은 자료만 고른 채로 둠
export function settleRequestDrafts(
  drafts: Record<string, RequestDraft>,
  before: RequestPreview[],
  after: RequestPreview[],
) {
  const changed = before.filter((previous) => {
    const next = after.find((value) => value.id === previous.id);
    return next && JSON.stringify(next.sourceDraft) !== JSON.stringify(previous.sourceDraft);
  });
  if (!changed.length) return drafts;
  const stale = new Set(changed.map((preview) => JSON.stringify(preview.sourceDraft)));
  const result: Record<string, RequestDraft> = {};
  for (const [id, draft] of Object.entries(drafts)) {
    if (!isEditDraft({ previews: after }, draft) && stale.has(JSON.stringify(draft))) continue;
    const frozen = changed.some((preview) => preview.id === draft.referencePreviewId)
      ? after.find((preview) => preview.id === draft.referencePreviewId)
      : undefined;
    result[id] = frozen
      ? {
          ...draft,
          includeGoodNote: draft.includeGoodNote && Boolean(frozen.goodNote),
          progressIds: draft.progressIds.filter((value) =>
            frozen.progress.some((entry) => entry.id === value),
          ),
          photoIds: draft.photoIds.filter((value) =>
            frozen.photos.some((photo) => photo.id === value),
          ),
        }
      : draft;
  }
  return result;
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
        // 준비를 고치는 초안은 그 준비 화면의 준비 고치기로만 이어 씀
        !isEditDraft(state, draft) &&
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

export function reviewUrl(draft: Pick<RequestDraft, 'id'>) {
  return `/requests/review?draft=${encodeURIComponent(draft.id)}`;
}
export function completeUrl(preview: Pick<RequestPreview, 'id'>) {
  return `/requests/complete/${encodeURIComponent(preview.id)}`;
}
// 사진 설명을 따로 적지 않으면 파일 이름이 들어 있음. 화면에는 파일 이름을 보여 주지 않음
export function visibleCaption(caption: string) {
  return /\.(jpe?g|png|webp|gif|heic|heif|avif)$/i.test(caption.trim()) ? '' : caption;
}
