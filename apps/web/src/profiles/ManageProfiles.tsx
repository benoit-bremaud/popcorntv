import { useEffect, useRef, useState } from 'react';
import { AVATAR_COLORS, PROFILE_NAME_MAX } from '@popcorntv/shared';
import type { ApiErrorCode, AvatarColor, Profile } from '@popcorntv/shared';
import { createProfile, deleteProfile, updateProfile } from '../api.js';
import type { ProfileFailure } from '../api.js';
import { Avatar } from './Avatar.js';

/** The profile writes UC9 needs: the real `/profiles` calls by default, fakes in tests. */
export interface ProfileApi {
  readonly create: typeof createProfile;
  readonly update: typeof updateProfile;
  readonly remove: typeof deleteProfile;
}

const DEFAULT_API: ProfileApi = {
  create: createProfile,
  update: updateProfile,
  remove: deleteProfile,
};

const MESSAGES: Partial<Record<ApiErrorCode, string>> = {
  profile_name_taken: 'That name is already used.',
  profile_limit: 'No more profiles can be added.',
  last_profile: 'The last profile cannot be deleted.',
  invalid_request: `Enter a name of 1 to ${PROFILE_NAME_MAX} characters.`,
  profile_not_found: 'That profile no longer exists.',
};

function message(error: ApiErrorCode | null): string {
  if (error === null) return 'The server could not be reached.';
  // Fastify's own 4xx bodies carry other strings: the change was still refused.
  return MESSAGES[error] ?? 'The server refused the change.';
}

type Props = {
  readonly profiles: readonly Profile[];
  /** Called after every successful write so the owner sees the new list. */
  readonly onChanged: () => void;
  readonly onDone: () => void;
  readonly api?: ProfileApi;
};

/** UC9: add, rename / recolour and delete profiles (anyone on the network until #18). */
export function ManageProfiles({
  profiles,
  onChanged,
  onDone,
  api = DEFAULT_API,
}: Props): React.JSX.Element {
  const [error, setError] = useState<string | null>(null);
  // Focus lands on the screen's heading on entry and after a delete removed the focused row.
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

  async function run(
    write: () => Promise<{ readonly ok: true } | ProfileFailure>,
  ): Promise<boolean> {
    const result = await write();
    if (!result.ok) {
      setError(message(result.error));
      return false;
    }
    setError(null);
    onChanged();
    return true;
  }

  return (
    <section className="profiles" aria-labelledby="manage-title">
      <h2 id="manage-title" className="profiles-title" ref={heading} tabIndex={-1}>
        Manage profiles
      </h2>
      <p className="profile-error" role="alert">
        {error}
      </p>
      <ul className="manage-list">
        {profiles.map((profile) => (
          <ProfileRow
            key={profile.id}
            profile={profile}
            onSave={(name, avatar) => run(() => api.update(profile.id, { name, avatar }))}
            onDelete={async () => {
              if (await run(() => api.remove(profile.id))) heading.current?.focus();
            }}
          />
        ))}
      </ul>
      <ProfileForm
        legend="Add a profile"
        submit="Add"
        className="profile-form profile-form-add"
        onSubmit={(name, avatar) => run(() => api.create({ name, avatar }))}
      />
      <button type="button" className="button" onClick={onDone}>
        Done
      </button>
    </section>
  );
}

function ProfileRow({
  profile,
  onSave,
  onDelete,
}: {
  readonly profile: Profile;
  readonly onSave: (name: string, avatar: AvatarColor) => Promise<boolean>;
  readonly onDelete: () => Promise<void>;
}): React.JSX.Element {
  const [confirming, setConfirming] = useState(false);
  return (
    <li className="manage-row">
      <Avatar profile={profile} size="sm" />
      <ProfileForm
        legend={`Edit ${profile.name}`}
        submit="Save"
        initial={profile}
        onSubmit={onSave}
      />
      <div className="manage-actions">
        {confirming ? (
          <>
            <button
              type="button"
              className="button"
              aria-label={`Delete ${profile.name} and their history`}
              onClick={() => void onDelete()}
            >
              Confirm delete
            </button>
            <button
              type="button"
              className="button button-quiet"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className="button button-quiet"
            aria-label={`Delete ${profile.name}`}
            onClick={() => setConfirming(true)}
          >
            Delete
          </button>
        )}
      </div>
    </li>
  );
}

/** The `<select>` only offers palette keys; anything else keeps the current colour. */
function asColor(value: string, current: AvatarColor): AvatarColor {
  return AVATAR_COLORS.find((color) => color === value) ?? current;
}

/** Name + colour fields; the add form clears itself after a successful submit. */
function ProfileForm({
  legend,
  submit,
  initial,
  className = 'profile-form',
  onSubmit,
}: {
  readonly legend: string;
  readonly submit: string;
  readonly initial?: Profile;
  readonly className?: string;
  readonly onSubmit: (name: string, avatar: AvatarColor) => Promise<boolean>;
}): React.JSX.Element {
  const [name, setName] = useState(initial?.name ?? '');
  const [avatar, setAvatar] = useState<AvatarColor>(initial?.avatar ?? 'blue');

  async function send(event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>): Promise<void> {
    event.preventDefault();
    const saved = await onSubmit(name.trim(), avatar);
    if (saved && initial === undefined) setName('');
  }

  return (
    <form className={className} onSubmit={(event) => void send(event)}>
      <fieldset>
        <legend className="visually-hidden">{legend}</legend>
        <input
          className="input"
          value={name}
          maxLength={PROFILE_NAME_MAX}
          required
          placeholder="Name"
          aria-label={`${legend}: name`}
          onChange={(event) => setName(event.target.value)}
        />
        <select
          className="input"
          value={avatar}
          aria-label={`${legend}: colour`}
          onChange={(event) => setAvatar(asColor(event.target.value, avatar))}
        >
          {AVATAR_COLORS.map((color) => (
            <option key={color} value={color}>
              {color}
            </option>
          ))}
        </select>
        <button type="submit" className="button">
          {submit}
        </button>
      </fieldset>
    </form>
  );
}
