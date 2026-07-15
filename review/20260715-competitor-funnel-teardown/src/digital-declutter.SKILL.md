---
name: digital-declutter
description: Clean up a messy desktop or Downloads folder into a simple, maintainable folder system — safely, on Mac or Windows. Use when someone says "organize my desktop", "clean up my downloads", "my desktop is a mess", "sort my files", "help me organize my computer", or wants their digital junk drawer sorted without risk of losing anything. The skill surveys the folder, proposes a plan, shows a dry-run preview, waits for a clear yes, then moves (never deletes) everything into logical folders and writes an undo list so any move can be reversed. Triggers on "organize my desktop", "clean up my downloads", "my desktop is a mess", "sort my files", "organize my computer".
---

# Digital Declutter

You are helping someone turn a messy desktop or Downloads folder into a clean, maintainable folder system. This is often the first real thing a person hands to an AI, so it has to feel safe and end well. A clean desktop is a small win that makes the next handoff feel possible.

Two rules sit above everything else in this skill:
- **You move things. You never delete anything.** Not one file. Ever.
- **Nothing moves until the person has seen the exact plan and said yes.**

Work on **Mac or Windows**. Detect which you are on and use the right method (Finder on Mac, File Explorer on Windows). If you cannot tell, ask once.

---

## Step 1: Request access and survey

Ask for permission to view the folder, and confirm which folder they want cleaned (Desktop and Downloads are the two most common). Then look at what is actually there:

- What folders already exist, and what do their names suggest?
- What loose files are there (screenshots, downloads, documents, images, installers)?
- Are there any files or folders they have already asked you to leave alone?

Take a screenshot or list the contents so you can refer to specific items by name.

---

## Step 2: Build the plan (let categories come from the real contents)

Group what you see into a small number of clear, plain-language folders. Do not force a preset structure — let the categories come from what is actually there. Common ones:

| Folder | What belongs here |
|---|---|
| DOCUMENTS | PDFs, contracts, forms, anything you read or sign |
| IMAGES | Screenshots, photos, graphics |
| INSTALLERS | App installers and setup files you can usually re-download |
| WORK | Active projects, client files, current campaigns |
| ARCHIVE | Old things you want out of sight but not gone |

Use plain names in CAPS so they are easy to scan. Fewer, clearer folders beat many overlapping ones.

**Leave these where they are (do not move):**
- Utility or launcher files that need to stay one click away
- Anything the person told you to leave alone
- System files, and anything you are not sure about — never guess with someone's files; ask

---

## Step 3: Show a dry-run preview, then wait for a clear yes

Before touching anything, show the full plan as a preview. Nothing has moved yet. Use this shape:

---
Here is what I found and exactly how I would sort it. **Nothing has moved yet** — this is a preview.

**Will create these folders:** DOCUMENTS, IMAGES, INSTALLERS, WORK

**Will move (from → to):**
- `Q3-invoice.pdf` → DOCUMENTS
- `Screenshot 2026-07-10.png` → IMAGES
- `Slack-setup.dmg` → INSTALLERS

**Will leave alone:**
- `Launch-App` (utility, kept one click away)
- `Family` (you asked me to leave this)

Reply **yes** to run it, or tell me what to change.
---

Ask clearly for a yes or an adjustment. If they change something, update the preview and show it again. **Do not move anything until they confirm.**

---

## Step 4: Write the undo list, then move

Once they confirm:

1. First, write a plain-text file named `declutter-undo.txt` in the same folder, listing every move as `moved: <original location> -> <new location>`. This is their safety net: if they dislike the result, this file tells them (or you) exactly how to put everything back.
2. Create all the new folders.
3. Move items **one at a time**, into the folders from the approved plan. Moving one at a time is more reliable than trying to move many at once.
4. After each move, confirm the item landed where it should and is gone from its old spot.

If any single move fails, note it, leave that file where it is, and keep going. Never delete a file to "clean up" a failed move.

---

## Step 5: Tidy and confirm

Once every approved move is done:
1. Line the icons up neatly (Clean Up on Mac; Sort by / auto-arrange on Windows).
2. Show a final screenshot or listing so they can see the result.
3. Confirm the `declutter-undo.txt` file is there and tell them what it is for.

---

## Step 6: Brief them (keep it short and human)

In 5 to 7 sentences, tell them:
1. What each folder is for, one line each.
2. The one rule going forward: the desktop is only for things you need one click away; everything else lives in a folder.
3. How to keep it clean: when something new lands, take ten seconds to drop it in the right folder.
4. Where the undo list is, in case they ever want to reverse a move.

Close warm and plain. They should feel in control, not lectured.

---

## Output Contract

A clean, sorted folder (Desktop or Downloads) on Mac or Windows, with new plain-language folders, every loose item moved (never deleted) per an approved plan, a `declutter-undo.txt` manifest of every move, tidied icons, and a short spoken brief. A dry-run preview must be shown and confirmed before any move happens.

## Failure Modes

- **Deleting anything.** This skill never deletes. It only moves. If in doubt, leave it.
- **Moving before confirmation.** No file moves until the person has seen the exact preview and said yes.
- **Skipping the undo list.** Always write `declutter-undo.txt` before the first move.
- **Guessing on unclear files.** If you cannot tell what something is or where it belongs, ask — do not guess with someone's files.
- **Touching flagged or system files.** Anything the person said to leave alone, or any system/utility file, stays exactly where it is.
- **Assuming the operating system.** Confirm Mac vs Windows before using platform-specific steps.
