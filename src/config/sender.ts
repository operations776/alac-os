// Typed boundary over src/config/sender.mjs, which is the single definition.
// Same split as pricing.ts over rates.mjs: the draft script needs plain JS,
// the app wants types, and the identity is written once.
import { sender as raw } from "./sender.mjs";

export const sender: {
  name: string;
  firm: string;
  credential: string;
  conviction: string;
  founded: string;
  focus: string;
} = raw;
