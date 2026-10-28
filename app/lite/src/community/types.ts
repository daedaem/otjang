export type Board = "outfits" | "sale" | "free";
export type Piece = { kind: string; color: string | null; label: string };
export type Sale = { merchant: string; price: number | null; discount: number | null; currency: "KRW"; endDate: string; sourceUrl: string };
export type Post = {
  id: string; author: { name: string }; mine: boolean; text: string; pieces: Piece[];
  photos: string[]; createdAt: number; hidden: string | null;
  board?: Board; title?: string; sale?: Sale | null; revision?: number; updatedAt?: number | null;
};
export type Status = {
  mode: string; member: { name: string } | null; rules: { version: number; items: string[] };
  reasons: { id: string; label: string }[]; contact: string | null; reviewDays: number;
  isOperator: boolean; signedIn: boolean;
  login: { kakao: boolean; google: boolean; email?: boolean } | null;
  operator: { name: string | null; contact: string | null; privacyOfficer: string | null } | null;
  minAge: number; limits?: { writesPerHour?: number };
};
export type Fail = { code: string; message?: string };
export type ReviewItem = Omit<Post, "mine"> & { reports: number; firstReportAt: number | null; reasons: Record<string, number> };
export type PostInput = { board?: Board; title?: string; sale?: Sale; text: string; pieces: Piece[]; consent: boolean };
export type CommunityClient = {
  status(): Promise<Status | Fail>;
  join(name: string, rules: number, age14: boolean): Promise<{ member: { name: string } } | Fail>;
  feed(options?: { board?: Board; cursor?: string; mine?: boolean }): Promise<{ items: Post[]; next: string | null } | Fail>;
  post(body: { post: PostInput; photos: string[] }): Promise<{ id: string } | Fail>;
  update(id: string, post: PostInput, revision: number): Promise<{ ok: true; revision: number } | Fail>;
  remove(id: string): Promise<{ ok: true } | Fail>;
  report(post: string, reason: string): Promise<{ ok: true; reviewDays: number } | Fail>;
  block(post: string): Promise<{ ok: true } | Fail>;
  blocks(): Promise<{ items: { key: string; name: string }[] } | Fail>;
  unblock(key: string): Promise<{ ok: true } | Fail>;
  leave(): Promise<{ ok: true } | Fail>;
  review(): Promise<{ items: ReviewItem[] } | Fail>;
  act(id: string, action: "restore" | "hide" | "delete"): Promise<{ ok: true } | Fail>;
  photoUrl(id: string): string;
  reviewPhotoUrl?(id: string): string;
  emailStart?(email: string): Promise<{ ok: true } | Fail>;
  emailVerify?(email: string, code: string): Promise<{ ok: true } | Fail>;
};
export type Garment = { id: string; label: string; kind: string; color: string | null; trial?: boolean };
export type CommunityHost = {
  element: HTMLElement; core: { getState(): { closet: Garment[] } };
  client?: CommunityClient | null; share?: Piece[] | null;
  info(): void; menu(): void; standalone?: boolean; logout?(): void;
  board?: string | null; mine?: boolean; restoreScroll?: number | null;
  navigate?(board: Board, mine: boolean): void;
  navigationGuard?(check: () => boolean): () => void;
  consumeShare?(): void;
};
