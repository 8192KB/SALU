import { newId } from './ids';
import { z } from 'zod';
import { AREAS, INTENTS } from './types';
import type { CutDraft, ProgressEntry, RecordPhoto, RequestDraft, RequestPreview } from './types';
import { isBlankCutDraft, newCutDraft } from './memory-repository';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const text = z.string().max(10000);
const date = z.iso.date();
const areas = z
  .array(z.enum(Object.keys(AREAS) as [keyof typeof AREAS, ...Array<keyof typeof AREAS>]))
  .max(6);
const photo = z.object({ id, url: z.string().max(500).default(''), caption: text });
const recordPhoto = photo.extend({ cutId: id, progressId: id.optional(), date });
const cut = z.object({
  id,
  cutDate: date,
  service: text,
  areas,
  goodNote: text,
  salonName: text,
  salonId: id.optional(),
  designerName: text,
  designerProfileId: id.optional(),
  price: z.number().int().nonnegative().safe().optional(),
});
const progress = z.object({
  id,
  cutId: id,
  observedOn: date,
  areas,
  discomfort: text,
  styling: text,
  question: text,
});
const request = z.object({
  id,
  area: z.enum(Object.keys(AREAS) as [keyof typeof AREAS, ...Array<keyof typeof AREAS>]),
  intent: z.enum(Object.keys(INTENTS) as [keyof typeof INTENTS, ...Array<keyof typeof INTENTS>]),
  content: text,
});
const draft = z.object({
  id,
  cutId: id,
  designerId: id.optional(),
  designerSnapshot: z.object({ id, name: text, salonName: text }).optional(),
  referencePreviewId: id.optional(),
  includeGoodNote: z.boolean(),
  progressIds: z.array(id).max(1000),
  photoIds: z.array(id).max(1000),
  requests: z.array(request).max(100),
  homeStyling: text,
  additionalQuestion: text,
});
const preview = z.object({
  id,
  createdAt: z.iso.datetime(),
  designer: z.object({ id, name: text, salonName: text }).optional(),
  cut: cut.pick({ id: true, cutDate: true, service: true, areas: true }),
  goodNote: text.optional(),
  progress: z.array(progress).max(1000),
  photos: z.array(recordPhoto).max(1000),
  requests: z.array(request).max(100),
  homeStyling: text,
  additionalQuestion: text,
  sourceDraft: draft,
});
const cutDraft = cut
  .omit({ id: true, price: true })
  .extend({ price: z.string().max(30), photos: z.array(photo).max(6) });
const progressDraft = progress
  .omit({ id: true, cutId: true })
  .extend({ photos: z.array(photo).max(6) });
export const bundleSchema = z.object({
  version: z.literal(1),
  state: z.object({
    cuts: z.array(cut).max(1000),
    progress: z.array(progress).max(10000),
    photos: z.array(recordPhoto).max(10000),
    designers: z.array(z.never()).length(0),
    previews: z.array(preview).max(10000),
  }),
  drafts: z.object({
    cutDraft,
    progressDrafts: z.record(id, progressDraft),
    cutEdits: z.record(id, cutDraft),
    progressEdits: z.record(id, progressDraft),
    requests: z.record(id, draft),
    currentRequestId: id.nullable(),
    steps: z.record(id, z.enum(['materials', 'write'])),
    recoveredCuts: z.array(cutDraft).max(100),
  }),
});
export type Bundle = z.infer<typeof bundleSchema>;
export type Drafts = Bundle['drafts'];
export type Asset = { id: string; blob: Blob };
export const emptyDrafts = (): Drafts => ({
  cutDraft: newCutDraft(),
  progressDrafts: {},
  cutEdits: {},
  progressEdits: {},
  requests: {},
  currentRequestId: null,
  steps: {},
  recoveredCuts: [],
});
export const emptyBundle = (): Bundle => ({
  version: 1,
  state: { cuts: [], progress: [], photos: [], designers: [], previews: [] },
  drafts: emptyDrafts(),
});

// Blob URLs are runtime handles. Only IDs and the corresponding image bytes cross storage boundaries.
export function mapPhotos<T>(input: T, url: (id: string) => string): T {
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      let result: unknown[] | undefined;
      for (let index = 0; index < value.length; index++) {
        const child = walk(value[index]);
        if (child !== value[index]) {
          result ??= value.slice();
          result[index] = child;
        }
      }
      return result ?? value;
    }
    if (!value || typeof value !== 'object') return value;
    const object = value as Record<string, unknown>;
    let result: Record<string, unknown> | undefined;
    for (const key of Object.keys(object)) {
      const child = walk(object[key]);
      if (child !== object[key]) {
        result ??= { ...object };
        result[key] = child;
      }
    }
    if ('url' in object && 'caption' in object && typeof object.id === 'string') {
      const nextUrl = url(object.id);
      if (nextUrl !== object.url) {
        result ??= { ...object };
        result.url = nextUrl;
      }
    }
    return result ?? value;
  };
  return walk(input) as T;
}
export function photoIds(bundle: Bundle): string[] {
  const ids = new Set<string>();
  mapPhotos(bundle, (id) => {
    ids.add(id);
    return '';
  });
  return [...ids];
}
export function serialize(bundle: Bundle): Bundle {
  return mapPhotos(bundle, () => '');
}
export function validateBundle(value: unknown): Bundle {
  const bundle = bundleSchema.parse(repairBundle(value));
  const { state, drafts } = bundle;
  const unique = (values: { id: string }[]) => {
    if (new Set(values.map((v) => v.id)).size !== values.length) throw new Error('duplicate');
  };
  [state.cuts, state.progress, state.photos, state.previews].forEach(unique);
  const cuts = new Set(state.cuts.map((v) => v.id));
  const progressIds = new Set(state.progress.map((v) => v.id));
  if (
    state.progress.some((v) => !cuts.has(v.cutId)) ||
    state.photos.some(
      (v) =>
        !cuts.has(v.cutId) ||
        (v.progressId && !state.progress.some((p) => p.id === v.progressId && p.cutId === v.cutId)),
    )
  )
    throw new Error('reference');
  for (const p of state.previews) {
    if (
      !cuts.has(p.cut.id) ||
      p.sourceDraft.cutId !== p.cut.id ||
      p.progress.some((v) => v.cutId !== p.cut.id) ||
      p.photos.some((v) => v.cutId !== p.cut.id)
    )
      throw new Error('preview reference');
  }
  for (const d of [
    ...Object.values(drafts.requests),
    ...state.previews.map((p) => p.sourceDraft),
  ]) {
    const frozen = d.referencePreviewId
      ? state.previews.find((p) => p.id === d.referencePreviewId && p.cut.id === d.cutId)
      : undefined;
    if (
      (d.designerSnapshot && d.designerSnapshot.id !== d.designerId) ||
      !cuts.has(d.cutId) ||
      (d.referencePreviewId && !frozen) ||
      d.progressIds.some(
        (id) =>
          !(frozen?.progress ?? state.progress).some((p) => p.id === id && p.cutId === d.cutId),
      ) ||
      d.photoIds.some(
        (id) => !(frozen?.photos ?? state.photos).some((p) => p.id === id && p.cutId === d.cutId),
      )
    )
      throw new Error('draft reference');
  }
  if (
    Object.keys(drafts.cutEdits).some((id) => !cuts.has(id)) ||
    Object.keys(drafts.progressDrafts).some((id) => !cuts.has(id)) ||
    Object.keys(drafts.progressEdits).some((id) => !progressIds.has(id)) ||
    (drafts.currentRequestId && !drafts.requests[drafts.currentRequestId])
  )
    throw new Error('edit reference');
  return serialize(bundle);
}
// known: 새 ID 대신 쓸 ID. 복원에서 이미 있는 같은 기록을 가리키는 초안을 그 기록에 붙일 때 씀
export function copyBundle(
  bundle: Bundle,
  known: ReadonlyMap<string, string> = new Map(),
): { bundle: Bundle; ids: Map<string, string> } {
  const ids = new Map<string, string>();
  const remap = (id: string) => {
    if (!ids.has(id)) ids.set(id, known.get(id) ?? newId());
    return ids.get(id)!;
  };
  const idKeys = new Set(['id', 'cutId', 'progressId', 'referencePreviewId', 'currentRequestId']);
  const maps = new Set(['progressDrafts', 'cutEdits', 'progressEdits', 'requests', 'steps']);
  // ID를 키로 쓰는 객체는 drafts 바로 아래뿐. 준비 초안의 requests 배열 항목 키는 그대로 둠
  const walk = (value: unknown, key = '', idKeyed = false): unknown => {
    if (typeof value === 'string')
      return idKeys.has(key) || key === 'progressIds' || key === 'photoIds' ? remap(value) : value;
    if (Array.isArray(value)) return value.map((v) => walk(v, key));
    if (!value || typeof value !== 'object') return value;
    if (key === 'designer' || key === 'designerSnapshot') return structuredClone(value);
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        idKeyed ? remap(k) : k,
        walk(v, k, key === 'drafts' && maps.has(k)),
      ]),
    );
  };
  return { bundle: bundleSchema.parse(walk(serialize(repairBundle(bundle) as Bundle))), ids };
}
// 이전 copyBundle이 준비 요청 항목의 속성 이름을 새 ID로 바꿔 둔 자료를 되돌림
export function repairBundle(value: unknown): unknown {
  const areas = Object.keys(AREAS);
  const intents = Object.keys(INTENTS);
  const fields = ['id', 'area', 'intent', 'content'];
  const repairItem = (item: unknown): unknown => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    const keys = Object.keys(item);
    if (keys.length !== 4 || keys.some((k) => fields.includes(k))) return item;
    const values = Object.values(item);
    if (values.some((v) => typeof v !== 'string')) return item;
    const [first, area, intent, content] = values as string[];
    if (areas.includes(area) && intents.includes(intent))
      return { id: first, area, intent, content };
    const rest = (values as string[]).filter((v) => !areas.includes(v) && !intents.includes(v));
    const itemId = rest.find((v) => /^[A-Za-z0-9_-]{1,100}$/.test(v));
    return {
      id: itemId ?? newId(),
      area: values.find((v) => areas.includes(v as string)) ?? 'SIDE',
      intent: values.find((v) => intents.includes(v as string)) ?? 'ASK',
      content: rest.find((v) => v !== itemId) ?? '',
    };
  };
  let changed = false;
  const walk = (node: unknown, key = ''): unknown => {
    if (Array.isArray(node))
      return node.map((v) => {
        if (key !== 'requests') return walk(v);
        const fixed = repairItem(v);
        if (fixed !== v) changed = true;
        return fixed;
      });
    if (!node || typeof node !== 'object') return node;
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, walk(v, k)]));
  };
  const result = walk(value);
  return changed ? result : value;
}
export function appendBundle(target: Bundle, added: Bundle): Bundle {
  return {
    version: 1,
    state: {
      cuts: [...added.state.cuts, ...target.state.cuts],
      progress: [...target.state.progress, ...added.state.progress],
      photos: [...target.state.photos, ...added.state.photos],
      designers: [],
      previews: [...target.state.previews, ...added.state.previews],
    },
    drafts: {
      cutDraft: target.drafts.cutDraft,
      // 복원한 초안이 이미 있는 기록을 가리키면 같은 키가 생길 수 있음. 이 기기의 초안을 둠
      progressDrafts: { ...added.drafts.progressDrafts, ...target.drafts.progressDrafts },
      cutEdits: { ...added.drafts.cutEdits, ...target.drafts.cutEdits },
      progressEdits: { ...added.drafts.progressEdits, ...target.drafts.progressEdits },
      requests: { ...added.drafts.requests, ...target.drafts.requests },
      steps: { ...added.drafts.steps, ...target.drafts.steps },
      currentRequestId: target.drafts.currentRequestId ?? added.drafts.currentRequestId,
      recoveredCuts: [
        ...target.drafts.recoveredCuts,
        ...added.drafts.recoveredCuts,
        ...(isBlankCutDraft(added.drafts.cutDraft) ? [] : [added.drafts.cutDraft]),
      ],
    },
  };
}

// ---------- 복원할 때 같은 기록 찾기 ----------

// 기록 하나(커트·경과·사진·준비)를 ID 없이 비교하는 열쇠. 사진은 파일 내용(hash)으로 비교하고,
// hash를 모르는 사진이 있으면 어느 기록과도 같지 않음
type RecordUnit = {
  key: string;
  cut: string;
  progress: [string, string][];
  photos: [string, string][];
  previews: [string, RequestPreview][];
};
// 기기에 저장한 객체와 백업에서 읽은 객체는 속성 순서가 달라 속성 이름 순서로 맞춰 비교함
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, child: unknown) =>
    child && typeof child === 'object' && !Array.isArray(child)
      ? Object.fromEntries(Object.entries(child).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : child,
  );
}
const byKey = <T>(values: [string, T][]) =>
  values.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
function recordUnits(bundle: Bundle, hash: (id: string) => string | undefined) {
  const { state } = bundle;
  const progressById = new Map<string, ProgressEntry>();
  const photoById = new Map<string, RecordPhoto>();
  for (const entry of [...state.progress, ...state.previews.flatMap((p) => p.progress)])
    if (!progressById.has(entry.id)) progressById.set(entry.id, entry);
  for (const photo of [...state.photos, ...state.previews.flatMap((p) => p.photos)])
    if (!photoById.has(photo.id)) photoById.set(photo.id, photo);
  const progressKey = (entry: ProgressEntry | undefined) =>
    entry
      ? JSON.stringify([
          entry.observedOn,
          entry.areas,
          entry.discomfort,
          entry.styling,
          entry.question,
        ])
      : '?';
  const photoKey = (photo: RecordPhoto | undefined) =>
    photo
      ? JSON.stringify([
          hash(photo.id) ?? `?${photo.id}`,
          photo.caption,
          photo.date,
          photo.progressId ? progressKey(progressById.get(photo.progressId)) : null,
        ])
      : '?';
  const requestsKey = (draft: Pick<RequestDraft, 'requests'>) =>
    draft.requests.map((item) => [item.area, item.intent, item.content]);
  const previewKey = (preview: RequestPreview) => {
    const draft = preview.sourceDraft;
    const reference = state.previews.find((value) => value.id === draft.referencePreviewId);
    return JSON.stringify([
      preview.createdAt,
      canonical(preview.designer ?? null),
      [preview.cut.cutDate, preview.cut.service, preview.cut.areas],
      preview.goodNote ?? null,
      preview.progress.map(progressKey),
      preview.photos.map(photoKey),
      requestsKey(preview),
      preview.homeStyling,
      preview.additionalQuestion,
      [
        draft.id === preview.id,
        draft.designerId ?? null,
        canonical(draft.designerSnapshot ?? null),
        reference ? (reference.id === preview.id ? 'self' : reference.createdAt) : null,
        draft.includeGoodNote,
        draft.progressIds.map((id) => progressKey(progressById.get(id))),
        draft.photoIds.map((id) => photoKey(photoById.get(id))),
        requestsKey(draft),
        draft.homeStyling,
        draft.additionalQuestion,
      ],
    ]);
  };
  return state.cuts.map((cut): RecordUnit => {
    const progress = byKey(
      state.progress
        .filter((entry) => entry.cutId === cut.id)
        .map((entry): [string, string] => [progressKey(entry), entry.id]),
    );
    const photos = byKey(
      state.photos
        .filter((photo) => photo.cutId === cut.id)
        .map((photo): [string, string] => [photoKey(photo), photo.id]),
    );
    const previews = byKey(
      state.previews
        .filter((preview) => preview.cut.id === cut.id)
        .map((preview): [string, RequestPreview] => [previewKey(preview), preview]),
    );
    return {
      key: JSON.stringify([
        [
          cut.cutDate,
          cut.service,
          cut.areas,
          cut.goodNote,
          cut.salonName,
          cut.salonId ?? null,
          cut.designerName,
          cut.designerProfileId ?? null,
          cut.price ?? null,
        ],
        progress.map(([key]) => key),
        photos.map(([key]) => key),
        previews.map(([key]) => key),
      ]),
      cut: cut.id,
      progress,
      photos,
      previews,
    };
  });
}
// added에서 target에 이미 있는 같은 기록(cut ID)과, 그 기록을 가리키는 ID → target의 ID
export function matchRecords(
  target: Bundle,
  targetHash: (id: string) => string | undefined,
  added: Bundle,
  addedHash: (id: string) => string | undefined,
) {
  const existing = new Map<string, RecordUnit>();
  for (const unit of recordUnits(target, targetHash))
    if (!existing.has(unit.key)) existing.set(unit.key, unit);
  const matched = new Set<string>();
  const known = new Map<string, string>();
  const link = (from: string, to: string) => {
    if (!known.has(from)) known.set(from, to);
  };
  for (const unit of recordUnits(added, addedHash)) {
    const same = existing.get(unit.key);
    if (!same) continue;
    matched.add(unit.cut);
    link(unit.cut, same.cut);
    // 열쇠가 모두 같으므로 정렬한 순서대로 짝이 맞음
    unit.progress.forEach(([, id], index) => link(id, same.progress[index][1]));
    unit.photos.forEach(([, id], index) => link(id, same.photos[index][1]));
    unit.previews.forEach(([, preview], index) => {
      const other = same.previews[index][1];
      link(preview.id, other.id);
      link(preview.sourceDraft.id, other.sourceDraft.id);
      preview.progress.forEach((entry, i) => link(entry.id, other.progress[i].id));
      preview.photos.forEach((photo, i) => link(photo.id, other.photos[i].id));
      preview.requests.forEach((item, i) => link(item.id, other.requests[i].id));
      preview.sourceDraft.requests.forEach((item, i) =>
        link(item.id, other.sourceDraft.requests[i].id),
      );
    });
  }
  return { matched, known };
}
export function withoutRecords(bundle: Bundle, cuts: ReadonlySet<string>): Bundle {
  if (!cuts.size) return bundle;
  const { state } = bundle;
  return {
    ...bundle,
    state: {
      cuts: state.cuts.filter((cut) => !cuts.has(cut.id)),
      progress: state.progress.filter((entry) => !cuts.has(entry.cutId)),
      photos: state.photos.filter((photo) => !cuts.has(photo.cutId)),
      designers: [],
      previews: state.previews.filter((preview) => !cuts.has(preview.cut.id)),
    },
  };
}
// 복사한 초안 중 이 기기에 이미 같은 내용이 있는 것을 뺌. 초안 ID와 요청 항목 ID는 비교하지 않음
export function withoutSameDrafts(
  target: Bundle,
  added: Bundle,
  sameCut: (a: CutDraft, b: CutDraft) => boolean,
): Bundle {
  const requestKey = (draft: RequestDraft) =>
    canonical({
      ...draft,
      id: '',
      requests: draft.requests.map((item) => ({ ...item, id: '' })),
    });
  const existing = new Set(
    [
      ...Object.values(target.drafts.requests),
      ...target.state.previews.map((p) => p.sourceDraft),
    ].map(requestKey),
  );
  const requests = Object.fromEntries(
    Object.entries(added.drafts.requests).filter(([, draft]) => !existing.has(requestKey(draft))),
  );
  const cutDrafts = [target.drafts.cutDraft, ...target.drafts.recoveredCuts];
  const known = (draft: CutDraft) => cutDrafts.some((value) => sameCut(value, draft));
  return {
    ...added,
    drafts: {
      ...added.drafts,
      requests,
      steps: Object.fromEntries(
        Object.entries(added.drafts.steps).filter(([id]) => Object.hasOwn(requests, id)),
      ),
      currentRequestId:
        added.drafts.currentRequestId && Object.hasOwn(requests, added.drafts.currentRequestId)
          ? added.drafts.currentRequestId
          : null,
      cutDraft: known(added.drafts.cutDraft) ? newCutDraft() : added.drafts.cutDraft,
      recoveredCuts: added.drafts.recoveredCuts.filter((draft) => !known(draft)),
    },
  };
}
