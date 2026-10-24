/** Avatar colour keys (spec profiles §4.3); the web maps each to a design token. */
export const AVATAR_COLORS = [
  'red',
  'amber',
  'green',
  'teal',
  'blue',
  'violet',
  'pink',
  'slate',
] as const;

export type AvatarColor = (typeof AVATAR_COLORS)[number];

/** The profile seeded by the migration; it owns the progress saved before #10 (ADR-0008 §2). */
export const DEFAULT_PROFILE_ID = 'default';

/** Longest profile name, after trimming. */
export const PROFILE_NAME_MAX = 40;

/** Most profiles a server holds (spec profiles R5). */
export const PROFILE_LIMIT = 12;

/** One household member (class diagram `Profile`). */
export interface Profile {
  readonly id: string;
  readonly name: string;
  readonly avatar: AvatarColor;
}

/** Body of `POST /profiles`. */
export type CreateProfileBody = Omit<Profile, 'id'>;

/** Body of `PATCH /profiles/:profileId`. */
export type UpdateProfileBody = Partial<CreateProfileBody>;
