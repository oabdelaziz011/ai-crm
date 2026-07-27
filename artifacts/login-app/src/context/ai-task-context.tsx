import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { FloatingAiTask, FloatingAiTaskStatus } from "@/lib/floating-ai/types";

type AiTaskContextValue = {
  tasks: FloatingAiTask[];
  activeTaskCount: number;
  startTask: (label: string, options?: { background?: boolean }) => string;
  updateTaskProgress: (taskId: string, progress: number, message?: string) => void;
  completeTask: (taskId: string, message?: string) => void;
  failTask: (taskId: string, message?: string) => void;
  cancelTask: (taskId: string) => void;
  dismissTask: (taskId: string) => void;
  onTaskComplete: (callback: (task: FloatingAiTask) => void) => () => void;
};

const AiTaskContext = createContext<AiTaskContextValue | null>(null);

export function AiTaskProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<FloatingAiTask[]>([]);
  const completeListeners = useRef<Set<(task: FloatingAiTask) => void>>(new Set());

  const notifyComplete = useCallback((task: FloatingAiTask) => {
    for (const listener of completeListeners.current) {
      listener(task);
    }
  }, []);

  const startTask = useCallback((label: string, options?: { background?: boolean }) => {
    const id = crypto.randomUUID();
    const task: FloatingAiTask = {
      id,
      label,
      status: "running",
      progress: 0,
      startedAt: new Date().toISOString(),
      background: options?.background ?? true,
    };
    setTasks((prev) => [task, ...prev]);
    return id;
  }, []);

  const updateTask = useCallback(
    (taskId: string, patch: Partial<FloatingAiTask>) => {
      setTasks((prev) =>
        prev.map((task) => (task.id === taskId ? { ...task, ...patch } : task)),
      );
    },
    [],
  );

  const updateTaskProgress = useCallback(
    (taskId: string, progress: number, message?: string) => {
      updateTask(taskId, {
        progress: Math.min(100, Math.max(0, progress)),
        message,
        status: "running" as FloatingAiTaskStatus,
      });
    },
    [updateTask],
  );

  const completeTask = useCallback(
    (taskId: string, message?: string) => {
      setTasks((prev) => {
        const task = prev.find((t) => t.id === taskId);
        if (task) {
          notifyComplete({ ...task, status: "completed", progress: 100, message });
        }
        return prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                status: "completed" as FloatingAiTaskStatus,
                progress: 100,
                message,
                completedAt: new Date().toISOString(),
              }
            : t,
        );
      });
    },
    [notifyComplete],
  );

  const failTask = useCallback(
    (taskId: string, message?: string) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                status: "failed" as FloatingAiTaskStatus,
                message,
                completedAt: new Date().toISOString(),
              }
            : t,
        ),
      );
    },
    [],
  );

  const cancelTask = useCallback((taskId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, status: "cancelled" as FloatingAiTaskStatus, completedAt: new Date().toISOString() }
          : t,
      ),
    );
  }, []);

  const dismissTask = useCallback((taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  const onTaskComplete = useCallback((callback: (task: FloatingAiTask) => void) => {
    completeListeners.current.add(callback);
    return () => {
      completeListeners.current.delete(callback);
    };
  }, []);

  const activeTaskCount = useMemo(
    () => tasks.filter((t) => t.status === "running" || t.status === "pending").length,
    [tasks],
  );

  const value = useMemo<AiTaskContextValue>(
    () => ({
      tasks,
      activeTaskCount,
      startTask,
      updateTaskProgress,
      completeTask,
      failTask,
      cancelTask,
      dismissTask,
      onTaskComplete,
    }),
    [
      tasks,
      activeTaskCount,
      startTask,
      updateTaskProgress,
      completeTask,
      failTask,
      cancelTask,
      dismissTask,
      onTaskComplete,
    ],
  );

  return <AiTaskContext.Provider value={value}>{children}</AiTaskContext.Provider>;
}

export function useAiTasks(): AiTaskContextValue {
  const ctx = useContext(AiTaskContext);
  if (!ctx) {
    throw new Error("useAiTasks must be used within AiTaskProvider");
  }
  return ctx;
}
