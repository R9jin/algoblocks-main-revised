# KLIRANS (Clearance)

*A Philippine collegiate psychological survival horror game*

<!-- TODO: add a banner or title-screen screenshot -->
<!-- ![KLIRANS title screen](docs/title.png) -->

> **Gameplay video:** TODO – add link
> **Download (Windows build):** TODO – add link

**KLIRANS** is a first-person survival horror game set in the halls of the Pamantasan ng Cabuyao BCH Building. It takes the dread of Philippine university **clearance season** and turns it into a nightmare: you are a student trapped inside the campus during a night lockdown and blackout, and the only way out is to collect **six official signatures** on your clearance slip.

Academic project, August – October 2026. Team of 6.

---

## Table of Contents

- [Premise](#premise)
- [Game Loop](#game-loop)
- [Controls](#controls)
- [Mechanics](#mechanics)
- [Clearance Signatures](#clearance-signatures)
- [Enemies](#enemies)
- [Game Over](#game-over)
- [Developer Tools](#developer-tools)
- [Saving](#saving)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Credits](#credits)

---

## Premise

You are an exhausted undergraduate who just wants to finish clearance. An unannounced lockdown shuts the gates, the power starts failing, and the familiar corridors begin to warp. Stairwells loop, the staff behave strangely, and the stress of bureaucracy takes the form of things that hunt you.

To get out you must:

1. Rebuild your torn clearance slip.
2. Get it signed by six department heads, in order.
3. Submit it to the Registrar, then reach the main gate.

## Game Loop

```
Explore the 3 floors  ->  Complete department tasks and puzzles
        ->  Manage anxiety and survive blackouts
        ->  Escape past the Security Guard stalker
```

## Controls

| Action | Key |
|---|---|
| Move | `W` `A` `S` `D` |
| Sprint | `Left Shift` (drains stamina) |
| Crouch | `Left Ctrl` / `C` |
| Interact / pick up | `E` |
| Flashlight | `F` or `Left Mouse Button` |
| Select inventory slot | `1`–`6` or mouse wheel |
| Drop held item | `G` |
| Inspect held item (3D) | `V` |
| Objectives and dossier | `Tab` (hold) |
| Help / tutorial | `H` |
| Pause | `Esc` |
| Quick save / quick load | `F5` / `F8` |

Keys can be rebound from **Settings → Keymapping**.

## Mechanics

**Anxiety meter.** There is no health bar. Darkness, nearby enemies, jumpscares and failed puzzles raise your anxiety. As it climbs the screen vignettes, the camera breathes, and your hearing is distorted. At 100% you collapse and the game ends. Lockers, light, food and finishing tasks bring it back down.

**Flashlight.** It freezes the Weeping Student and lets you see down dark corridors, but it makes you easier for the Proctor to spot from further away.

**Stealth.** Crouching makes your footsteps silent to enemies that listen. Lockers hide you completely from sight and hearing.

**Stamina.** Sprinting is fast but tires you out. Running while exhausted is slow and loud.

**Inventory.** Six slots. Pick up with `E`, drop with `G`. Quest items cannot be dropped.

**3D item inspection.** Hold an item and press `V` to examine it in a rotating viewer. Clues are written on the items themselves. The game never prints codes in menus or dialogue, so you have to look.

**Puzzles and minigames.** Safe cracking, lockpicking, a word puzzle, document sorting, a ledger-balancing puzzle, a circuit breaker and fuse puzzle, and more.

**Looping stairwells.** The three stairwells are unstable and can send you somewhere you did not expect.

## Clearance Signatures

Department heads sign in a fixed order. Each one sends you to the next.

| # | Signatory | Floor |
|---|---|---|
| 1 | Head Librarian | 3rd |
| 2 | Guidance Counselor | 2nd |
| 3 | CCS Dean | 2nd |
| 4 | University Registrar | 1st |
| 5 | University Cashier | 1st |
| 6 | Executive Vice President | 1st |

Once all six are done, return to the Registrar to log the slip, then reach the main lobby gate.

No spoilers here: finding out how each signature is earned is part of the game.

## Enemies

| Enemy | Behavior |
|---|---|
| **The Proctor** | Hunts the halls during blackouts. Hears sprinting from far away and sees further when your flashlight is on. If he grabs you, mash the struggle prompt to break free. |
| **The Weeping Student** | Only moves when you are not looking. Eye contact or your flashlight beam freezes her. Turn away and she charges. |
| **Security Guard Stalker** | The end-game pursuer. Only appears once all six signatures are submitted. Patrols the whole building and hunts your last known position. One catch ends the run. |
| **Wandering students** | Ambient NPCs. They can spot you or bump into you for a small anxiety spike. |
| **Registrar** | Runs away when startled. You have to chase her across the floors. |

How enemies sense you:

| Enemy | Sound | Vision | Notes |
|---|---|---|---|
| Guard Stalker | Walking ~9 m, sprinting ~20 m | 75° cone, ~16 m, line of sight | Crouching is silent. Lockers are safe. |
| Proctor | Sprinting ~22 m | 115° cone, 14 m (21 m with flashlight) | Crouching is silent. Lockers are safe. |
| Weeping Student | – | Reacts to your gaze | Freezes while you look at her. |
| Wandering students | – | 100° cone, ~5 m, plus touch | Small anxiety cost. |

All enemies use Unity's NavMesh for pathfinding.

## Game Over

When anxiety reaches 100% or the Guard catches you, the game plays a collapse cutscene (vertigo, knees buckle, the flashlight dies), then shows an aged incident report with your survival time and signature count, and a **CLEARANCE TERMINATED** stamp. You can wake up and retry or return to the main menu.

## Developer Tools

A Free Roam developer panel (`~` or `F1`) is available in free roam mode only.

- **Calm / Active mode.** Calm mode is a safe sandbox. Active mode turns on real anxiety, enemy spawns and jumpscares.
- **Teleport** to any room or stairwell.
- **AI telemetry** with state tags, vision cones, hearing radii and NavMesh paths.
- **Live sliders** for enemy speeds, vision angles and whistle timing.
- Spawn and test individual enemies.

## Saving

- `F5` quick save, `F8` quick load, also available from the pause menu.
- Autosaves at milestones: each signature, breaker power restored, safes opened, form printed.
- Saves store progress (signatures, inventory, solved puzzles, unlocked doors) rather than raw object IDs, so they survive map changes.

## Tech Stack

- **Engine:** Unity (version: TODO)
- **Language:** C#
- **AI:** Unity NavMesh, raycast line of sight, hearing radius checks
- **Items:** ScriptableObjects
- **UI:** Unity UI (uGUI)
- **Platform:** Windows

## Getting Started

### Play

Download the latest build from **Releases** (TODO), unzip and run `KLIRANS.exe`.

### Run from source

1. Install **Unity Hub** and Unity **TODO version**.
2. Clone the repo:
   ```bash
   git clone https://github.com/R9jin/klirans.git
   ```
3. Open the folder in Unity Hub.
4. Open `Assets/Scenes/SampleScene.unity`.
5. Press **Play**.

If the scene opens dark, wait for the NavMesh and lighting to finish loading, then press Play again.

## Project Structure

```
Assets/
  Scenes/      SampleScene.unity
  Scripts/     Player, AI, puzzles, UI, save system
  Items/       ScriptableObject quest items
  Prefabs/
  Audio/
```

<!-- TODO: update the folder names to match the repo -->

## Credits

**Team:** TODO – list the six members and roles.
**Programming:** TODO – your name.

Programmed in Unity with AI-assisted development tools (Antigravity).

**Assets:** TODO – credit every font, sound and model you did not make. This includes the whistle sound effect and the title font, with links and licenses.

Built for the University of Cabuyao (Pamantasan ng Cabuyao), BS Computer Science.

## License

TODO – choose a license, or write "All rights reserved" for a school project.
