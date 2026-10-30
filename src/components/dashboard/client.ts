"use client";

import { useEffect } from "react";

/** Fired after any action that changes tickets, so every mounted panel refetches. */
export const DATA_CHANGED_EVENT = "aftersales:data-changed";

export function emitDataChanged(): void {
  window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
}

export function useDataChanged(handler: () => void): void {
  useEffect(() => {
    const listener = () => handler();
    window.addEventListener(DATA_CHANGED_EVENT, listener);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, listener);
  }, [handler]);
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "error" in body
        ? ((body as { error?: { message?: string } }).error?.message ?? `request failed (${response.status})`)
        : `request failed (${response.status})`;
    throw new ApiError(response.status, message);
  }
  return body as T;
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1d ago" : `${days}d ago`;
}
