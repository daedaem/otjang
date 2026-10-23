export type Choice = { id: string; name?: string; label?: string; hex?: string };
export type Registration = { draftId: string; brand: string; name: string; kind: string; color: string; url: string; source?: { provider: 'opf'; code: string } };
export type Garment = { id: string; label: string; kind: string; color: string | null };
export interface Core {
  version(): number;
  subscribe(listener: () => void): () => void;
  getState(): { closetCount: number; closet: Garment[] };
  kindChoices(): Choice[];
  colorChoices(): Choice[];
  findProducts(query: string, options: { limit: number }): { id: string; brand: string; name: string }[];
  registerGarment(input: Registration): Garment;
  addOwnedProduct(id: string): Garment;
}
export type StoredDraft = { v: 1; step: number; values: Registration; updatedAt: string };
export type InputState = { values: Registration; step: number; pending: { type: 'ready'; value: StoredDraft } | { type: 'blocked'; message: string } | null; notice: string };
export interface InputSession {
  subscribe(listener: () => void): () => void;
  getSnapshot(): InputState;
  change(key: keyof Registration, value: string): void;
  setStep(step: number): void;
  restore(): number;
  restart(): InputState;
  finish(): string | undefined;
}
export interface InputHost {
  input: InputSession;
  element: HTMLElement;
  core: Core;
  step: number;
  back(): void;
  next(step: number): void;
  saved(garment: Garment, input?: Registration, warning?: string): void;
  assertWritable(): void;
}
export interface RegistrationRepository {
  execute(input: Registration): Promise<Garment>;
}
export function registrationRepository(core: Core, assertWritable: () => void): RegistrationRepository {
  // UI never writes wardrobe storage directly. A later HTTP adapter can preserve
  // this async command contract while the core remains the subscribed read model.
  return { async execute(input) { assertWritable(); return core.registerGarment(input); } };
}
