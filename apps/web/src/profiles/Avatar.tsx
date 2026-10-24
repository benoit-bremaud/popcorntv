import type { Profile } from '@popcorntv/shared';

type Props = { readonly profile: Profile; readonly size?: 'sm' | 'lg' };

/** The profile's initial on its colour; decorative, the name is always shown beside it. */
export function Avatar({ profile, size = 'lg' }: Props): React.JSX.Element {
  return (
    <span className={`avatar avatar-${size} avatar-${profile.avatar}`} aria-hidden="true">
      {profile.name.charAt(0).toUpperCase()}
    </span>
  );
}
