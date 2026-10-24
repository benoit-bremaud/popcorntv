import { useEffect, useRef } from 'react';
import type { Profile } from '@popcorntv/shared';
import { Avatar } from './Avatar.js';

type Props = {
  readonly profiles: readonly Profile[];
  readonly onPick: (profile: Profile) => void;
  readonly onManage: () => void;
};

/** UC8 "Who's watching?": one button per profile, and the way into UC9. */
export function ProfilePicker({ profiles, onPick, onManage }: Props): React.JSX.Element {
  // The view replaced the one holding focus (switch, Done): start on the question.
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <section className="profiles" aria-labelledby="profiles-title">
      <h2 id="profiles-title" className="profiles-title" ref={heading} tabIndex={-1}>
        Who&apos;s watching?
      </h2>
      <ul className="profile-list">
        {profiles.map((profile) => (
          <li key={profile.id}>
            <button type="button" className="profile" onClick={() => onPick(profile)}>
              <Avatar profile={profile} />
              <span className="profile-name">{profile.name}</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="button button-quiet" onClick={onManage}>
        Manage profiles
      </button>
    </section>
  );
}
