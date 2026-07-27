import Dexie, { liveQuery, type Table } from "dexie";
import {
  BlobReader,
  BlobWriter,
  TextReader,
  TextWriter,
  ZipReader,
  ZipWriter,
} from "@zip.js/zip.js";
import type { SourceFile } from "@/store/bundler";

const defaultProjectTitle = "Untitled project";

export interface HistorySnapshot {
  id: number;
  createdAt: number;
  updatedAt: number;
  title: string;
  rspackVersion: string;
  fileCount: number;
}

interface StoredHistorySnapshot extends Omit<HistorySnapshot, "id"> {
  id?: number;
  archive: Blob;
}

class HistoryDatabase extends Dexie {
  history!: Table<StoredHistorySnapshot, number>;

  constructor() {
    super("rspack-playground-history");
    this.version(1).stores({
      history: "++id, createdAt",
    });
    this.version(2)
      .stores({
        history: "++id, createdAt, updatedAt",
      })
      .upgrade((transaction) =>
        transaction
          .table("history")
          .toCollection()
          .modify((record: StoredHistorySnapshot) => {
            record.updatedAt ??= record.createdAt;
          }),
      );
    this.version(3)
      .stores({
        history: "++id, createdAt, updatedAt",
      })
      .upgrade((transaction) =>
        transaction
          .table("history")
          .toCollection()
          .modify((record: StoredHistorySnapshot) => {
            record.title ??= defaultProjectTitle;
          }),
      );
  }
}

const database = new HistoryDatabase();
let pendingProjectCreation: Promise<HistorySnapshot> | null = null;

async function createArchive(files: SourceFile[]) {
  const blobWriter = new BlobWriter("application/zip");
  const zipWriter = new ZipWriter(blobWriter);

  for (const file of files) {
    await zipWriter.add(file.filename, new TextReader(file.text));
  }

  await zipWriter.close();
  return blobWriter.getData();
}

function getSnapshotMetadata(record: StoredHistorySnapshot): HistorySnapshot {
  if (record.id === undefined) {
    throw new Error("History snapshot is missing its id");
  }

  return {
    id: record.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt ?? record.createdAt,
    title: record.title ?? defaultProjectTitle,
    rspackVersion: record.rspackVersion,
    fileCount: record.fileCount,
  };
}

export async function listHistory(): Promise<HistorySnapshot[]> {
  const records = await database.history.orderBy("updatedAt").reverse().toArray();
  return records.map(getSnapshotMetadata);
}

export const historyObservable = liveQuery(() => listHistory());

export async function saveHistory(
  projectId: number | null,
  files: SourceFile[],
  rspackVersion: string,
): Promise<HistorySnapshot> {
  if (projectId === null) {
    if (pendingProjectCreation) {
      const snapshot = await pendingProjectCreation;
      return saveHistory(snapshot.id, files, rspackVersion);
    }

    const creation = createProjectRecord(files, rspackVersion);
    pendingProjectCreation = creation;
    try {
      const snapshot = await creation;
      return snapshot;
    } finally {
      if (pendingProjectCreation === creation) {
        pendingProjectCreation = null;
      }
    }
  }

  const archive = await createArchive(files);
  const updatedAt = Date.now();
  const existing = await database.history.get(projectId);
  let snapshot: HistorySnapshot;

  if (existing) {
    const updated = await database.history.update(projectId, {
      archive,
      rspackVersion,
      fileCount: files.length,
      updatedAt,
    });
    if (updated > 0) {
      snapshot = {
        id: projectId,
        createdAt: existing.createdAt,
        updatedAt,
        title: existing.title ?? defaultProjectTitle,
        rspackVersion,
        fileCount: files.length,
      };
    } else {
      snapshot = await createHistoryRecord(archive, updatedAt, rspackVersion, files.length);
    }
  } else {
    snapshot = await createHistoryRecord(archive, updatedAt, rspackVersion, files.length);
  }

  return snapshot;
}

async function createProjectRecord(
  files: SourceFile[],
  rspackVersion: string,
): Promise<HistorySnapshot> {
  const archive = await createArchive(files);
  const timestamp = Date.now();
  return createHistoryRecord(archive, timestamp, rspackVersion, files.length);
}

async function createHistoryRecord(
  archive: Blob,
  timestamp: number,
  rspackVersion: string,
  fileCount: number,
): Promise<HistorySnapshot> {
  const id = await database.history.add({
    archive,
    createdAt: timestamp,
    updatedAt: timestamp,
    title: defaultProjectTitle,
    rspackVersion,
    fileCount,
  });
  return {
    id,
    createdAt: timestamp,
    updatedAt: timestamp,
    title: defaultProjectTitle,
    rspackVersion,
    fileCount,
  };
}

export async function restoreHistory(
  id: number,
): Promise<{ files: SourceFile[]; rspackVersion: string }> {
  const record = await database.history.get(id);
  if (!record) {
    throw new Error("History snapshot not found");
  }

  const zipReader = new ZipReader(new BlobReader(record.archive));
  try {
    const entries = await zipReader.getEntries();
    const files: SourceFile[] = [];
    for (const entry of entries) {
      if (entry.directory || !entry.getData) {
        continue;
      }
      files.push({
        filename: entry.filename,
        text: await entry.getData(new TextWriter()),
      });
    }

    return { files, rspackVersion: record.rspackVersion };
  } finally {
    await zipReader.close();
  }
}

export async function deleteHistory(id: number): Promise<void> {
  await database.history.delete(id);
}

export async function renameHistory(id: number, title: string): Promise<void> {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    throw new Error("Project title cannot be empty");
  }

  const updated = await database.history.update(id, { title: trimmedTitle });
  if (updated === 0) {
    throw new Error("History snapshot not found");
  }
}
