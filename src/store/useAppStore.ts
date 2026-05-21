import { create } from "zustand";
import { type TxToastData } from "@/components/ui/TxToast";

interface UserState {
  address: string | undefined;
  isConnected: boolean;
  setAddress: (address: string | undefined) => void;
  setConnected: (connected: boolean) => void;
}

interface ToastState {
  toasts: TxToastData[];
  addToast: (toast: Omit<TxToastData, "id">) => void;
  updateToast: (id: string, updates: Partial<TxToastData>) => void;
  dismissToast: (id: string) => void;
}

export const useAppStore = create<UserState & ToastState>((set) => ({
  // User
  address: undefined,
  isConnected: false,
  setAddress: (address) => set({ address, isConnected: !!address }),
  setConnected: (connected) => set({ isConnected: connected }),

  // Toast notifications
  toasts: [],
  addToast: (toast) =>
    set((state) => ({
      toasts: [
        ...state.toasts,
        { ...toast, id: `${Date.now()}-${Math.random().toString(36).slice(2)}` },
      ],
    })),
  updateToast: (id, updates) =>
    set((state) => ({
      toasts: state.toasts.map((t) =>
        t.id === id ? { ...t, ...updates } : t
      ),
    })),
  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));
