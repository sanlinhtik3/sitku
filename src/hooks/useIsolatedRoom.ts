import { useState, useEffect, useCallback } from "react";

export type IsolatedRoom = "notes" | "cfo" | "consultant";

const ROOM_KEY = "beebot-active-room";

function isRoom(v: string | null | undefined): v is "cfo" | "consultant" {
  return v === "cfo" || v === "consultant";
}

// The Electron desktop build is served from file://. Storing the room in a `?_s=cfo` query on that
// file:// URL is fragile: reloading inside CFO/Consultant left the app wedged on a loader (Chromium
// mishandles a reloaded file:// URL that carries a query). So on desktop the room lives in
// sessionStorage instead — it survives a reload (restores the room) but clears on a fresh app launch
// (a relaunch starts clean at notes, never stuck in a room). Web keeps the URL as the source of
// truth so the back button and deep links keep working.
function isDesktop(): boolean {
  return typeof window !== "undefined"
    && (window.location.protocol === "file:" || Boolean((window as Window & { beebotDesktop?: unknown }).beebotDesktop));
}

// ponytail: native URLSearchParams + history/sessionStorage over external routing libs
function getRoom(): IsolatedRoom {
  if (typeof window === "undefined") return "notes";

  if (isDesktop()) {
    const stored = sessionStorage.getItem(ROOM_KEY);
    return isRoom(stored) ? stored : "notes";
  }

  // Web: the URL is the source of truth (back/forward, shareable deep links).
  const s = new URLSearchParams(window.location.search).get("_s");
  if (isRoom(s)) return s;

  // Auto-migrate legacy hash bookmarks (#cfo / #consultant) to the ?_s= query param.
  const h = window.location.hash.replace(/^#/, "");
  if (isRoom(h)) {
    const newUrl = new URL(window.location.href);
    newUrl.hash = "";
    newUrl.searchParams.set("_s", h);
    window.history.replaceState(null, "", newUrl.toString());
    return h;
  }

  return "notes";
}

export function useIsolatedRoom() {
  const [activeRoom, setActiveRoom] = useState<IsolatedRoom>(() => getRoom());

  useEffect(() => {
    const handleUrlChange = () => setActiveRoom(getRoom());
    window.addEventListener("popstate", handleUrlChange);
    window.addEventListener("hashchange", handleUrlChange);
    return () => {
      window.removeEventListener("popstate", handleUrlChange);
      window.removeEventListener("hashchange", handleUrlChange);
    };
  }, []);

  const openRoom = useCallback((room: "cfo" | "consultant") => {
    if (typeof window === "undefined" || getRoom() === room) return;
    if (isDesktop()) {
      sessionStorage.setItem(ROOM_KEY, room); // no URL mutation — a query on file:// breaks reload
    } else {
      const url = new URL(window.location.href);
      url.hash = "";
      url.searchParams.set("_s", room);
      window.history.pushState(null, "", url.toString());
    }
    setActiveRoom(room);
  }, []);

  const closeRoom = useCallback(() => {
    if (typeof window === "undefined" || getRoom() === "notes") return;
    if (isDesktop()) {
      sessionStorage.removeItem(ROOM_KEY);
    } else {
      const url = new URL(window.location.href);
      url.hash = "";
      url.searchParams.delete("_s");
      window.history.pushState(null, "", url.toString());
    }
    setActiveRoom("notes");
  }, []);

  return { activeRoom, openRoom, closeRoom };
}
