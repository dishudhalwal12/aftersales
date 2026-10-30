/**
 * Ambient declarations for asset imports.
 *
 * Next generates `next-env.d.ts` for these, but that file is a build artifact
 * (it references `.next/types/*`). Declaring the globs here means a fresh clone
 * can run `npm run typecheck` before the first build.
 */

declare module "*.css" {}
declare module "*.scss" {}
declare module "*.svg" {
  const src: string;
  export default src;
}
