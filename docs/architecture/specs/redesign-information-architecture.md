# Redesign — information architecture

How the household groups and names what PopCornTV offers, found by an open card sort and checked
by a task-based tree test before any drawing (#396, epic #401).

- Status: **draft** — card sort kit ready; sessions, tree and tree test pending
  in #429.
- Date: 2026-11-23.
- Inputs: [MoSCoW](../../requirements/07-redesign-moscow.md) (Must and Should rows),
  [personas](../../requirements/06-personas.md), [job stories](../../requirements/05-discovery-interviews.md#5-job-stories).

## 1. Method

| Step | What | Who | Output |
|---|---|---|---|
| 1 | Open card sort on paper (owner decision 2026-11-23, option A 460 / 500, matrix below) | Household participants; the owner facilitates and does not sort | Groups and names per participant |
| 2 | Synthesis: groups seen in at least two sorts, names most often given, cards that wander | Analyst | Candidate tree (§ 4) |
| 3 | Tree test, text only, no visuals | Participants other than the sorters when possible | Success and directness per task (§ 5) |
| 4 | Revise the tree once if needed, re-test the failed tasks | Same as step 3 | Validated tree |

Card sort protocol, owner decision 2026-11-23:

| Criterion | Weight | A Paper, owner facilitates | B Paper, owner sorts too | C Penpot for adults, paper for children |
|---|---:|---|---|---|
| Validity (no designer anchoring) | 30 | 5 — the owner does not sort | 3 — the owner's sort stays, even analysed apart | 4 |
| Easy for the household, children included | 30 | 5 — paper for all | 5 | 3 — two media, Penpot to learn |
| Local and private | 15 | 5 | 5 | 5 |
| Transcription effort | 15 | 3 — photos to transcribe | 3 | 4 |
| Owner's time | 10 | 4 | 3 — one more session | 2 — two kits to prepare |
| **Total /500** | 100 | **460** | **390** | **365** |

Points: A = 150 + 150 + 75 + 45 + 40 · B = 90 + 150 + 75 + 45 + 30 · C = 120 + 90 + 75 + 60 + 20.
Sensitivity: the owner's view is already captured by interview P1 and the MoSCoW, so B only adds
bias; B never overtakes A while validity weighs anything, and C overtakes A only if transcription
effort outweighs ease for the household.

Sample: the household gives at most a handful of people, so every reading is **qualitative**
(stable similarity statistics need about 15 sorters). The decision rules below are written before
the sessions.

| Participants besides the owner | Card sort | Tree test | Limitation recorded |
|---|---|---|---|
| 4 or more | 2 people | 2 other people | None |
| 3 | 2 people | The third, plus one sorter ≥ 1 week later | Partial reuse |
| 2 | Both | Both, ≥ 1 week later, tree labels differ from card text | Success overestimated |
| 1 | That person | The same, plus the #420 participants when available | Weak signal; tree provisional until #420 |

## 2. Privacy

Same rules as the [interviews](../../requirements/05-discovery-interviews.md#1-privacy).
Participants are `CS1`, `CS2`… (card sort) and `TT1`, `TT2`… (tree test), with an age band only;
a child is recorded as "child, 6–7" or "child, 8–13" with the parent's consent noted, never a
name. Photos of the paper sorts and the raw notes stay with the owner, are never committed, and
are deleted once the synthesis is validated.

## 3. Card sort kit

### Protocol (about 15 minutes)

1. Script: *"Here are cards about the home video app. Put together the cards that go together for
   you, as many piles as you like. Then give each pile a name. There is no right answer."*
2. Shuffle the cards; hand them over face up.
3. Do not explain a card. If asked, answer *"what would you guess?"* and note the question.
4. When the piles are done, the participant writes a name on a blank card for each pile.
5. Photograph the table; note the cards the participant hesitated over or put aside.
6. Transcribe, per participant: pile name → card numbers; then delete the photo after the
   synthesis.

Print the French text of the cards below, one per card, the number in a corner. The household
is French-speaking (brief D3): the sessions run in French.

### Adult cards (35)

Content and objects only; tasks belong to the tree test. Wording avoids today's screen labels.

| # | Card | Printed text (fr) |
|---|---|---|
| 1 | The film I stopped halfway | Le film arrêté en plein milieu |
| 2 | Films I own, A to Z | Mes films, de A à Z |
| 3 | Series I own and their seasons | Mes séries et leurs saisons |
| 4 | Documentaries I own | Mes documentaires |
| 5 | Films by genre (comedy, thriller…) | Les films par genre (comédie, thriller…) |
| 6 | Best-rated titles I own | Mes titres les mieux notés |
| 7 | Titles I have already seen | Les titres que j'ai déjà vus |
| 8 | Synopsis, cast and rating of a title | Résumé, acteurs et note d'un titre |
| 9 | Trailer of a title | Bande-annonce d'un titre |
| 10 | Episodes of a season | Les épisodes d'une saison |
| 11 | Audio language of a film | Langue audio d'un film |
| 12 | Subtitles of a film | Sous-titres d'un film |
| 13 | The other copy of the same film (another quality) | L'autre copie du même film (autre qualité) |
| 14 | Next episode | Épisode suivant |
| 15 | Titles everyone is watching right now (not in my library) | Ce que tout le monde regarde en ce moment (hors de ma bibliothèque) |
| 16 | Popular series this month | Les séries populaires du mois |
| 17 | Titles I would like to watch one day | Les titres que j'aimerais voir un jour |
| 18 | A wished title has arrived in my library | Un titre souhaité est arrivé dans ma bibliothèque |
| 19 | Which streaming service has this title | Sur quelle plateforme de streaming est ce titre |
| 20 | The streaming services I subscribe to | Les plateformes auxquelles je suis abonné |
| 21 | My own web link for a title | Mon propre lien web pour un titre |
| 22 | Search by title or actor | Chercher un titre ou un acteur |
| 23 | Who is watching (my profile) | Qui regarde (mon profil) |
| 24 | Add a profile for a family member | Ajouter un profil pour un membre de la famille |
| 25 | A child's account and what it may watch | Le compte d'un enfant et ce qu'il peut regarder |
| 26 | Interface language | Langue de l'interface |
| 27 | My phone as the remote | Mon téléphone comme télécommande |
| 28 | Connect the TV to my account | Connecter la TV à mon compte |
| 29 | Media folders on the server | Les dossiers de vidéos sur le serveur |
| 30 | Scan the folders for new files | Rechercher les nouveaux fichiers dans les dossiers |
| 31 | Invite a relative | Inviter un proche |
| 32 | Accounts and their devices | Les comptes et leurs appareils |
| 33 | Sign-in history | L'historique des connexions |
| 34 | App version | Version de l'application |
| 35 | Sign out | Se déconnecter |

### Child cards (18, pictures with a short label, read aloud)

For a child aged 8–13. Each card shows a poster or a simple pictogram and two to four words.
Children under 8 do not sort; they take part in the tree test orally (§ 5).

| # | Card | Printed text (fr) | Picture |
|---|---|---|---|
| K1 | My show I stopped | Ma série arrêtée | Poster with a progress bar |
| K2 | Cartoons | Dessins animés | Animated film poster |
| K3 | Films | Films | Film poster |
| K4 | Series | Séries | Series poster with "S1" |
| K5 | Next episode | Épisode suivant | Arrow over a poster |
| K6 | Watch the trailer | Voir la bande-annonce | Small screen with a play sign |
| K7 | What the film is about | L'histoire du film | Poster with lines of text |
| K8 | Already seen | Déjà vu | Poster with a tick |
| K9 | Search | Chercher | Magnifying glass |
| K10 | My profile picture | Mon image de profil | Round avatar |
| K11 | Change profile | Changer de profil | Two avatars |
| K12 | French or English | Français ou anglais | Two speech bubbles, "FR" and "EN" |
| K13 | Subtitles | Sous-titres | Speech bubble with lines |
| K14 | New films | Nouveaux films | Star badge on a poster |
| K15 | My favourite list | Ma liste préférée | Heart over posters |
| K16 | Remote on the phone | La télécommande sur le téléphone | Phone with arrows |
| K17 | The end | C'est fini | Curtain closing |
| K18 | Go back | Revenir | Arrow pointing left |

## 4. Results and candidate tree

Pending the sessions.

## 5. Tree test

Run on the candidate tree, text only. The tasks cover home, playback, discovery, profiles, phone
remote and administration, and are worded without the tree's labels. Each task records **success** (the
participant ends on a correct node) and **directness** (no backtracking) separately. Rule: a
task failed by two or more participants, or by every participant when only one takes it,
triggers one revision of the tree and a re-test of that task.

### Tasks

Worded without the tree's labels; read aloud in French. Correct nodes are set once the tree exists. A child takes the oral subset only.

| # | Task | Read aloud (fr) | Area | Flow | Child (oral) |
|---|---|---|---|---|---|
| T1 | Go back to the film you stopped last night | Reprends le film que tu as arrêté hier soir | Home | F3 | Yes |
| T2 | Find every film with an actor you like | Trouve tous les films où joue un acteur que tu aimes | Search | F5 | No |
| T3 | Turn on French subtitles during a film | Mets les sous-titres en français pendant un film | Player | F6 | Yes |
| T4 | Watch a film's trailer before deciding | Regarde la bande-annonce d'un film avant de te décider | Title | F7 | Yes |
| T5 | Keep a film you do not own for later | Garde de côté pour plus tard un film que tu n'as pas | Discover | F8 | No |
| T6 | Find which streaming service has a series you do not own | Trouve sur quelle plateforme on peut voir une série que tu n'as pas | Discover | F9 | No |
| T7 | A film you were waiting for has arrived: where do you see it? | Un film que tu attendais est arrivé : où le vois-tu ? | Notifications | F10 | No |
| T8 | Someone new joins the household: make them their own space | Quelqu'un de nouveau arrive à la maison : fais-lui sa propre place | Profiles | F19 | No |
| T9 | Start a film on the TV from your phone | Lance un film sur la télé depuis ton téléphone | Remote | F11 | No |
| T10 | Make a new folder of films appear in the app (owner role) | Fais apparaître un nouveau dossier de films dans l'appli | Administration | F14 | No |

## 6. Deep links

Each view and title gets its own path ([ADR-0041](../decisions/0041-give-views-and-titles-their-own-path.md),
accepted 2026-11-23); the path table follows the validated tree.
