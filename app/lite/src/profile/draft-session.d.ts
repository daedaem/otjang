import type { ProfileCore, ProfileSession } from "./types";
export function createProfileSession(options: {
  core: ProfileCore;
  storage: Storage;
  garmentId: string;
  key: string;
  clock?: () => string;
}): ProfileSession;
