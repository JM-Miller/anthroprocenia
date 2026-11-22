# Publishing Anthroprocenia

Everything needed for a release is in this folder. Run **`Prepare Publish.bat`**
(one level up) before each release so the folder matches the current mod source.

| Path | Kept or regenerated | Purpose |
|---|---|---|
| `PUBLISHING.md` | kept | This guide |
| `workshop_description.txt` | kept | Steam Workshop description (Steam BBCode) |
| `civfanatics_description.txt` | kept | CivFanatics download page text (forum BBCode) |
| `CHANGELOG.txt` | kept | Release notes; paste the latest entry as change notes |
| `preview.png` / `preview.jpg` | kept, **you supply** | 512x512 Workshop thumbnail |
| `SteamWorkshop\anthroprocenia\` | regenerated | Exact mod folder to upload to the Workshop |
| `SteamWorkshop\preview.*` | regenerated | Copy of the preview image |
| `CivFanatics\Anthroprocenia_v<version>.zip` | regenerated | Download for CivFanatics / manual install |
| `BUILD_INFO.txt` | regenerated | Version, build time, and file list of the last build |

## 1. Prepare

1. Bump `version` on the `<Mod>` element in `anthroprocenia\anthroprocenia.modinfo`.
   The zip name uses it.
2. Add an entry to `CHANGELOG.txt`.
3. Double-click `Prepare Publish.bat`. It:
   - runs the tests (`node --test tests/`) and stops if they fail;
   - checks that every file listed in the modinfo exists;
   - mirrors the mod into `SteamWorkshop\anthroprocenia\`, leaving out development-only
     files (`scripts\`, `tests\`, `.git`, `*.disabled`, logs) and adding `README.md`
     `MODDING_GUIDE.txt`, and `LICENSE.txt`;
   - rebuilds the CivFanatics zip and `BUILD_INFO.txt`.

   Options (also usable from a terminal): `skiptests`, `force` (continue even if tests
   fail), `nopause`. Example: `"Prepare Publish.bat" skiptests nopause`.
4. Optional smoke test: copy `SteamWorkshop\anthroprocenia\` into
   `%LOCALAPPDATA%\Firaxis Games\Sid Meier's Civilization VII\Mods\` (replacing the
   development copy), restart the game, and check that the mod loads.

## 2. Steam Workshop

Workshop uploads use the **Sid Meier's Civilization VII Development Tools** (Steam >
Library > Tools).

1. Open the Development Tools' mod uploader.
2. **Confirm the correct item and ownership before uploading.** The previously
   recorded item `3759409080` currently opens as **REWIND: Replay Map History**,
   not Anthroprocenia. Do not assume it is this release's upload target. Once
   confirmed, update the intended existing Anthroprocenia item rather than
   creating a duplicate.
3. Content folder: `Publish\SteamWorkshop\anthroprocenia` (the folder that contains
   `anthroprocenia.modinfo`).
4. Preview image: `Publish\SteamWorkshop\preview.png` (or `.jpg`).
5. Title `Anthroprocenia`. Description: paste `workshop_description.txt`. Change notes:
   paste the latest `CHANGELOG.txt` entry. Visibility: Public.
6. Upload, then open the Workshop page and check the description and image.

## 3. CivFanatics

1. Go to Civ VII Downloads on forums.civfanatics.com and choose **Add resource**
   (or **Post update** / **Upload a new version** on the existing resource).
2. Upload `CivFanatics\Anthroprocenia_v<version>.zip`. It contains a single top-level
   `anthroprocenia\` folder, so users can extract it directly into their `Mods` folder.
3. Paste `civfanatics_description.txt` as the overview and the latest changelog entry
   as the update notes. Set the version string to match the modinfo.

## Notes

- The mod id `anthroprocenia_map_history` must not change. The layout file is loaded
  from `fs://game/anthroprocenia_map_history/...`, and changing it would make the mod a
  separate item for existing players.
- `AffectsSavedGames` is `1`. The mod includes gameplay setup, speed and calendar
  changes; do not describe it as a purely cosmetic, freely toggleable add-on.
  Back up saves before updating and fully restart the game.
- Preparing these files does not upload them. A Workshop preview image is still
  required if neither `Publish\preview.png` nor `Publish\preview.jpg` exists.
