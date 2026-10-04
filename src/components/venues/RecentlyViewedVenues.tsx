"use client";

import { useEffect, useState } from "react";
import { MapPin, X, WifiOff } from "lucide-react";
import Link from "next/link";
import {
  RECENTLY_VIEWED_STORAGE_KEY,
  type RecentlyViewedVenue,
} from "@/components/venues/RecentlyViewedTracker";
import {
  getRecentlyViewedVenuesOffline,
  clearRecentlyViewedVenuesOffline,
} from "@/lib/offlineStorage";

export function RecentlyViewedVenues() {
  const [venues, setVenues] = useState<RecentlyViewedVenue[]>([]);
  const [isOffline, setIsOffline] = useState(false);

  const loadRecentlyViewed = async () => {
    // 1. First try loading up to 20 cached venues from IndexedDB
    try {
      const idbVenues = await getRecentlyViewedVenuesOffline();
      if (Array.isArray(idbVenues) && idbVenues.length > 0) {
        setVenues(idbVenues as RecentlyViewedVenue[]);
        return;
      }
    } catch {
      // IndexedDB might not be available; fall back to localStorage
    }

    // 2. Fall back to localStorage (up to 5)
    try {
      const stored = localStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY);

      if (!stored) {
        setVenues([]);
        return;
      }

      const parsed = JSON.parse(stored);

      if (Array.isArray(parsed)) {
        setVenues(parsed.slice(0, 5));
      } else {
        setVenues([]);
      }
    } catch (error) {
      console.error("Failed to load recently viewed venues:", error);
      setVenues([]);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsOffline(!navigator.onLine);

      const handleOnline = () => {
        setIsOffline(false);
        loadRecentlyViewed();
      };
      const handleOffline = () => {
        setIsOffline(true);
        loadRecentlyViewed();
      };

      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);

      loadRecentlyViewed();

      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }
  }, []);

  const handleClear = async () => {
    try {
      localStorage.removeItem(RECENTLY_VIEWED_STORAGE_KEY);
      await clearRecentlyViewedVenuesOffline();
    } catch (error) {
      console.error("Failed to clear recently viewed venues:", error);
    }
    setVenues([]);
  };

  if (venues.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="recently-viewed-heading" className="space-y-2">
      {/* Offline Mode Banner (Issue #3512) */}
      {isOffline && (
        <div
          data-testid="offline-cached-banner"
          role="status"
          className="flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-300"
        >
          <WifiOff className="h-4 w-4 shrink-0 text-amber-500" />
          <span>Offline Mode (Cached Data)</span>
        </div>
      )}
      <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2">
        <p
          id="recently-viewed-heading"
          className="text-[10px] uppercase font-black tracking-widest text-zinc-400"
        >
          Recently Viewed
        </p>

        <button
          type="button"
          onClick={handleClear}
          className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
        >
          Clear
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {venues.map((venue) => (
          <Link
            key={venue.id}
            href={`/venues/${venue.id}`}
            className="group rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 transition-all hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-zinc-800 dark:text-zinc-100">
                  {venue.name}
                </p>

                {venue.address && (
                  <p className="mt-1 flex items-start gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                    <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                    <span className="line-clamp-2">{venue.address}</span>
                  </p>
                )}
              </div>

              <X
                className="h-4 w-4 shrink-0 text-transparent group-hover:text-zinc-300 dark:group-hover:text-zinc-600"
                aria-hidden="true"
              />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
