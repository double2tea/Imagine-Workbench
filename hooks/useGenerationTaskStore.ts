"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { listGenerationTasks, type GenerationTask } from "@/lib/generation-tasks";

interface UseGenerationTaskStoreOptions {
  boardId?: string;
}

export interface GenerationTaskStore {
  generationTasks: GenerationTask[];
  reloadGenerationTasks: () => Promise<void>;
  setGenerationTasks: Dispatch<SetStateAction<GenerationTask[]>>;
}

export function useGenerationTaskStore(options: UseGenerationTaskStoreOptions = {}): GenerationTaskStore {
  const [generationTasks, setGenerationTasks] = useState<GenerationTask[]>([]);

  const reloadGenerationTasks = useCallback(async () => {
    const tasks = await listGenerationTasks({ boardId: options.boardId });
    setGenerationTasks(tasks);
  }, [options.boardId]);

  useEffect(() => {
    void reloadGenerationTasks();
  }, [reloadGenerationTasks]);

  return {
    generationTasks,
    reloadGenerationTasks,
    setGenerationTasks,
  };
}
