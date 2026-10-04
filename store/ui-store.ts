"use client";

import { create } from "zustand";

type UiState = {
  hoveredPlaceId: string | null;
  draggingActivityId: string | null;
  focusPlaceId: string | null;
  explorerOpen: boolean;
  setHoveredPlaceId: (id: string | null) => void;
  setDraggingActivityId: (id: string | null) => void;
  setFocusPlaceId: (id: string | null) => void;
  setExplorerOpen: (open: boolean) => void;
  toggleExplorer: () => void;
};

export const useUi = create<UiState>((set) => ({
  hoveredPlaceId: null,
  draggingActivityId: null,
  focusPlaceId: null,
  explorerOpen: false,
  setHoveredPlaceId: (hoveredPlaceId) => set({ hoveredPlaceId }),
  setDraggingActivityId: (draggingActivityId) => set({ draggingActivityId }),
  setFocusPlaceId: (focusPlaceId) => set({ focusPlaceId }),
  setExplorerOpen: (explorerOpen) => set({ explorerOpen }),
  toggleExplorer: () => set((state) => ({ explorerOpen: !state.explorerOpen })),
}));
