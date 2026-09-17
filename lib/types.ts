export type Photo = {
  id: string;
  position: number;
  mime: string;
  size: number;
};
export type FlowerRecord = {
  id: string;
  cityCode: string;
  date: string;
  title: string;
  flower: string;
  meaning: string;
  story: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  photos: Photo[];
};
export type RecordDraft = {
  id: string;
  cityCode: string;
  date: string;
  title: string;
  flower: string;
  meaning: string;
  story: string;
  version?: number;
  keepPhotos: string[];
  coverPhoto?: string;
};
