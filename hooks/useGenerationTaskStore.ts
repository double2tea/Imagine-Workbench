"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
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
  const reloadScopeRef = useRef(0);

  const reloadGenerationTasks = useCallback(async () => {
    const scope = ++reloadScopeRef.current;
    const tasks = await storage.list({ boardId: options.boardId });
    if (scope !== reloadScopeRef.current) return;
    setGenerationTasks(tasks);
  }, [options.boardId, storage]);

  useEffect(() => {
    void reloadGenerationTasks();
    return () => {
      reloadScopeRef.current += 1;
    };
  }, [reloadGenerationTasks]);

  return {
    generationTasks,
    reloadGenerationTasks,
    setGenerationTasks,
  };
}
