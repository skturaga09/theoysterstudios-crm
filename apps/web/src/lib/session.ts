import { create } from "zustand";
import type { Member } from "../data/types";

export type SessionMember = Member & { photoURL?: string };
/** The signed-in person as the API knows them — a team member, or the hidden "support" login. */
export const useSession = create<{ me?: SessionMember }>(() => ({}));
