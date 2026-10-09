export type Id = string;
export const AREAS = {
  FRONT: '앞머리',
  SIDE: '옆머리',
  TOP: '윗머리',
  BACK: '뒤·목선',
  ENDS: '머리끝',
  WHOLE: '전체',
} as const;
export type Area = keyof typeof AREAS;
export const INTENTS = { KEEP: '그대로', CHANGE: '바꾸기', ASK: '물어보기' } as const;
export type Intent = keyof typeof INTENTS;

export type PhotoDraft = { id: Id; url: string; caption: string };
export type RecordPhoto = PhotoDraft & { cutId: Id; progressId?: Id; date: string };
export type CutRecord = {
  id: Id;
  cutDate: string;
  service: string;
  areas: Area[];
  goodNote: string;
  salonName: string;
  designerName: string;
  designerProfileId?: Id;
  price?: number;
};
export type ProgressEntry = {
  id: Id;
  cutId: Id;
  observedOn: string;
  areas: Area[];
  discomfort: string;
  styling: string;
  question: string;
};
export type DesignerProfile = {
  id: Id;
  name: string;
  introduction: string;
  specialties: string[];
  affiliations: { salonName: string; period: string; current: boolean }[];
  reviewExamples: { id: Id; content: string; date: string }[];
};
export type RequestItem = { id: Id; area: Area; intent: Intent; content: string };
export type RequestDraft = {
  id: Id;
  designerId?: Id;
  referencePreviewId?: Id;
  cutId: Id;
  includeGoodNote: boolean;
  progressIds: Id[];
  photoIds: Id[];
  requests: RequestItem[];
  homeStyling: string;
  additionalQuestion: string;
};
export type RequestPreview = {
  id: Id;
  createdAt: string;
  designer?: { id: Id; name: string; salonName: string };
  cut: { id: Id; cutDate: string; service: string; areas: Area[] };
  goodNote?: string;
  progress: ProgressEntry[];
  photos: RecordPhoto[];
  requests: RequestItem[];
  homeStyling: string;
  additionalQuestion: string;
  sourceDraft: RequestDraft;
};
export type PrototypeState = {
  cuts: CutRecord[];
  progress: ProgressEntry[];
  photos: RecordPhoto[];
  designers: DesignerProfile[];
  previews: RequestPreview[];
};
export type CutDraft = {
  cutDate: string;
  service: string;
  areas: Area[];
  goodNote: string;
  salonName: string;
  designerName: string;
  designerProfileId?: Id;
  price: string;
  photos: PhotoDraft[];
};
export type ProgressDraft = {
  observedOn: string;
  areas: Area[];
  discomfort: string;
  styling: string;
  question: string;
  photos: PhotoDraft[];
};
export interface PrototypeRepository {
  getSnapshot(): PrototypeState;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  createCut(input: CutDraft): Promise<CutRecord>;
  updateCut(id: Id, input: Omit<CutDraft, 'photos'>): Promise<CutRecord>;
  addProgress(cutId: Id, input: ProgressDraft): Promise<ProgressEntry>;
  updateProgress(cutId: Id, id: Id, input: Omit<ProgressDraft, 'photos'>): Promise<ProgressEntry>;
  createPreview(draft: RequestDraft): Promise<RequestPreview>;
  createPreviewForDesigner(previewId: Id, designerId: Id): Promise<RequestPreview>;
  preparePhotos(files: File[], existingCount: number): Promise<PhotoDraft[]>;
  releasePhoto(photo: PhotoDraft): void;
  reset(): void;
  dispose(): void;
}
