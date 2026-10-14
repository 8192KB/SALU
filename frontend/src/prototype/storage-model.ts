import { newId } from './ids';
import { z } from 'zod';
import { AREAS, INTENTS } from './types';
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
export function copyBundle(bundle: Bundle): { bundle: Bundle; ids: Map<string, string> } {
  const ids = new Map<string, string>();
  const remap = (id: string) => {
    if (!ids.has(id)) ids.set(id, newId());
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
      progressDrafts: { ...target.drafts.progressDrafts, ...added.drafts.progressDrafts },
      cutEdits: { ...target.drafts.cutEdits, ...added.drafts.cutEdits },
      progressEdits: { ...target.drafts.progressEdits, ...added.drafts.progressEdits },
      requests: { ...target.drafts.requests, ...added.drafts.requests },
      steps: { ...target.drafts.steps, ...added.drafts.steps },
      currentRequestId: target.drafts.currentRequestId ?? added.drafts.currentRequestId,
      recoveredCuts: [
        ...target.drafts.recoveredCuts,
        ...added.drafts.recoveredCuts,
        ...(isBlankCutDraft(added.drafts.cutDraft) ? [] : [added.drafts.cutDraft]),
      ],
    },
  };
}
