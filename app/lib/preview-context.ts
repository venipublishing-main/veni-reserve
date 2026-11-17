import { createContext } from "react-router";
export type PreviewIdentity = { source: string; nonce: string };
export const previewContext = createContext<PreviewIdentity | null>(null);
