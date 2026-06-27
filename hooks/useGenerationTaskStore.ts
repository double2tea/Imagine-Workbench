"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  indexedDbGenerationTaskStorage,
  type GenerationTask,
  type GenerationTaskStorage,
} from "@/lib/generation-tasks";

interface UseGenerationTaskStoreOptions {
  boardId?: string;
  storage?: Pick<GenerationTaskStorage, "list">;
}

export interface GenerationTaskStore {
  generationTasks: GenerationTask[];
  reloadGenerationTasks: () => Promise<void>;
  setGenerationTasks: Dispatch<SetStateAction<GenerationTask[]>>;
}

export function useGenerationTaskStore(options: UseGenerationTaskStoreOptions = {}): GenerationTaskStore {
  const [generationTasks, setGenerationTasks] = useState<GenerationTask[]>([]);
  const storage = options.storage ?? indexedDbGenerationTaskStorage;

  const reloadGenerationTasks = useCallback(async () => {
    const tasks = await storage.list({ boardId: options.boardId });
    setGenerationTasks(tasks);
  }, [options.boardId, storage]);

  useEffect(() => {
    void reloadGenerationTasks();
  }, [reloadGenerationTasks]);

  return {
    generationTasks,
    reloadGenerationTasks,
    setGenerationTasks,
  };
}
