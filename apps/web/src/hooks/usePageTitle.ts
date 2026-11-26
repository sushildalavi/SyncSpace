import { useEffect } from "react";

/**
 * Names the browser tab for pages rendered on the client. Screen readers read the title on load, and Next's route
 * announcer reads it after in-app navigation, so every page needs its own.
 */
export function usePageTitle(title: string | null | undefined): void {
  useEffect(() => {
    if (title) document.title = `${title} · SyncSpace`;
  }, [title]);
}
