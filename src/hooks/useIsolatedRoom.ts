import { useState, useEffect, useCallback } from "react";

export type IsolatedRoom = "notes" | "cfo" | "consultant";

// ponytail: native URLSearchParams + history API over external routing libs
function getRoomFromUrl(): IsolatedRoom {
  if (typeof window === "undefined") return "notes";
  
  const params = new URLSearchParams(window.location.search);
  const s = params.get("_s");
  if (s === "cfo" || s === "consultant") return s;

  // Auto-migrate legacy hash bookmarks (#cfo / #consultant) to ?_s= query param
  const h = window.location.hash.replace(/^#/, "");
  if (h === "cfo" || h === "consultant") {
    const newUrl = new URL(window.location.href);
    newUrl.hash = "";
    newUrl.searchParams.set("_s", h);
    window.history.replaceState(null, "", newUrl.toString());
    return h;
  }

  return "notes";
}

export function useIsolatedRoom() {
  const [activeRoom, setActiveRoom] = useState<IsolatedRoom>(() => getRoomFromUrl());

  useEffect(() => {
    const handleUrlChange = () => {
      setActiveRoom(getRoomFromUrl());
    };
    window.addEventListener("popstate", handleUrlChange);
    window.addEventListener("hashchange", handleUrlChange);
    return () => {
      window.removeEventListener("popstate", handleUrlChange);
      window.removeEventListener("hashchange", handleUrlChange);
    };
  }, []);

  const openRoom = useCallback((room: "cfo" | "consultant") => {
    if (typeof window === "undefined" || getRoomFromUrl() === room) return;
    const url = new URL(window.location.href);
    url.hash = "";
    url.searchParams.set("_s", room);
    window.history.pushState(null, "", url.toString());
    setActiveRoom(room);
  }, []);

  const closeRoom = useCallback(() => {
    if (typeof window === "undefined" || getRoomFromUrl() === "notes") return;
    const url = new URL(window.location.href);
    url.hash = "";
    url.searchParams.delete("_s");
    window.history.pushState(null, "", url.toString());
    setActiveRoom("notes");
  }, []);

  return { activeRoom, openRoom, closeRoom };
}
