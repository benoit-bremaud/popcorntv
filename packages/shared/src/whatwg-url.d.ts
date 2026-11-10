/**
 * The WHATWG `URL` global, present in Node ≥ 22 and every browser; this package builds against
 * plain ES2022, so only the members `normaliseTitleLink` reads are declared.
 */
declare class URL {
  constructor(input: string);
  readonly href: string;
  readonly protocol: string;
  readonly hostname: string;
  readonly username: string;
  readonly password: string;
}
