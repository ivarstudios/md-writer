# md-writer: Microsoft Store listing

Everything to paste or upload in Partner Center, field by field, in the order the
pages show them. Text fields are plain text, because the Store doesn't render
markdown. Character counts are checked against the Store's limits.

---

## Store listing → Description

```
Markdown is how we write now. Prompts, plans, specs, meeting notes, READMEs, and the files AI agents read and write all day: AGENTS.md, CLAUDE.md, handoffs, transcripts. Most of us have hundreds of them, and more every week.

They deserve better than an IDE that treats prose like source code, or a notes app that wants to own your files.

md-writer is a calm, minimal place for them. No sidebar, no toolbar, no panels, no account. A page, your words, and four quiet icons.

THE TEXT YOU SEE IS THE MARKDOWN
Headings grow, quotes get a rule, code turns monospace, finished tasks fade. The syntax stays on screen, dimmed, and heading marks hang in the margin so your prose stays flush. There's no preview pane, and nothing is hidden or rewritten behind your back.

MADE FOR FILES THAT CHANGE
When an agent, or any other app, rewrites the file you have open, md-writer shows the new version as it lands. If you have unsaved edits, it asks before replacing anything, so your work is never overwritten.

SAVED EXACTLY AS WRITTEN
Ctrl+S saves in place and keeps the file's encoding and line endings, byte for byte. There's no export step and no copy drifting away from the original.

RIGHT WHERE YOU NEED IT
Right-click any .md, .txt, .log, .rst, .adoc or .org file and choose Open with, then md-writer. Each file gets its own window. Plain text stays plain, with markdown styling one click away.

QUIET BY DESIGN
• Serif or monospace, at any size from 70% to 160%
• Light and dark, following Windows
• A word count, plus a live count of whatever you select
• Ctrl+B and Ctrl+I for bold and italics
• Fully offline: no account, no telemetry, nothing leaves your PC
• Open source under the MIT License

Less chrome. More words.
```

## Store listing → What's new in this version

Leave this empty for the first submission. For later releases, write one or two
plain sentences about the change.

## Store listing → Product features

One per line, up to 20, each at most 200 characters:

```
The text you see is the markdown, styled as you type, with the syntax kept on screen
Heading marks hang in the margin, so your prose stays flush
Live reload when an AI agent or another app changes the open file
Never overwrites unsaved edits: asks before reloading
Saves in place with Ctrl+S, keeping encoding and line endings byte for byte
Opens .md, .txt, .log, .rst, .adoc and .org from right-click, Open with
One window per file
Plain text stays plain, with markdown styling a click away
Serif or monospace, at any size from 70% to 160%
Light and dark, following Windows
A word count, plus a live count of your selection
Works fully offline, with no account and no telemetry
Open source (MIT)
```

## Store listing → Screenshots

Upload in this order from `windows/store/`, each with its caption (at most 200 characters):

| File | Caption |
|---|---|
| `1-light-markdown.png` | `The text you see is the markdown: styled as you type, with the syntax kept on screen, dimmed.` |
| `2-dark-code.png` | `A calm home for AGENTS.md, CLAUDE.md and every other file your tools read and write.` |
| `3-light-mono-live-reload.png` | `When an agent changes the file, md-writer shows it, and asks before replacing your unsaved edits.` |
| `4-dark-two-windows.png` | `One window per file. Plain text stays plain, with markdown styling a click away.` |

## Store logos

| Slot | File (in `windows/store/art/`) |
|---|---|
| 9:16 Poster art, 1440 × 2160 | `poster-1440x2160.png` |
| 1:1 Box art, 2160 × 2160 | `box-2160x2160.png` |
| 1:1 App tile icon, 300 × 300 | `tile-300.png` |
| 1:1, 150 × 150 | `tile-150.png` |
| 1:1, 71 × 71 | `tile-71.png` |

## Trailers and additional assets

- **Video:** `windows/store/md-writer-trailer.mp4`. It's 1920 × 1080 at 30 fps, H.264 High with AAC stereo at 48 kHz, 60 seconds.
- **Thumbnail:** `windows/store/md-writer-trailer-thumbnail.png` (1920 × 1080).
- **Title:**

  ```
  md-writer: a calm place for your markdown
  ```

- **Closed captions:** none needed, because the trailer has no speech.
- **Audio description:** none. All the information is in the on-screen captions.
- **Choose a trailer to play at the top of your Store listing:** pick the one
  above. It only plays when the Super hero art below is uploaded.

## Windows and Xbox image

| Slot | File |
|---|---|
| 16:9 Super hero art, 3840 × 2160 | `windows/store/art/hero-3840x2160.png` (no text or UI, as required) |

## Xbox images

Leave empty. md-writer isn't offered on Xbox.

## Supplemental fields

- **Short title:**

  ```
  md-writer
  ```

- **Voice title:** leave empty (it's Xbox only).
- **Short description** (270 characters recommended):

  ```
  Markdown is how we write now: prompts, plans, specs and the files AI agents live in. md-writer gives them a calm, minimal home. The text you see is the markdown, styled as you type and saved exactly as written.
  ```

## Additional information

- **Keywords** (7 at most, 40 characters each, 21 words in total): enter each
  one and press Enter.

  ```
  markdown editor
  markdown viewer
  md
  text editor
  minimal writing
  AI agent files
  notes
  ```

- **Copyright and trademark info:**

  ```
  © 2026 IVAR Studios
  ```

- **Additional license terms:**

  ```
  The source code of md-writer is published under the MIT License: https://github.com/ivarstudios/md-writer
  ```

- **Developed by:**

  ```
  IVAR Studios
  ```

---

## The other submission pages

- **Pricing and availability:** set your base price. All markets, public
  audience, discoverable.
- **Properties:**
  - Category: Productivity.
  - Privacy policy URL: optional, since the app collects nothing. If asked, link a
    one-line page on md.ivar.studio: "md-writer doesn't collect, store or transmit
    any personal information."
  - Website: `https://md.ivar.studio`.
  - Support contact: an email address you want public, or `https://github.com/ivarstudios/md-writer/issues`.
  - Product declarations: leave the defaults. Don't tick the accessibility
    declaration unless you've tested against the guidelines.
- **Age ratings:** answer No to every question (no user interaction, no shared
  location, no purchases, no unrestricted web access). That gives 3+ / Everyone.
- **Submission options → restricted capabilities** (`runFullTrust`):

  ```
  md-writer is a desktop (Win32) app built with WinUI 3 and the Windows App SDK, packaged as MSIX. runFullTrust is the standard capability for packaged desktop apps; the app cannot run as a desktop process without it.

  It is used to:
  - Open the text files (.md, .markdown, .txt, .log, .rst, .adoc, .org and similar) that the user chooses through File Explorer's "Open with", drag and drop, the file picker or the md-writer command, and save them in place at their original location, keeping their encoding and line endings.
  - Watch the file that is currently open for changes, so the view updates when another program modifies it and the user is asked before unsaved edits are replaced.
  - Host the editor interface in WebView2, and add opened files to the taskbar jump list's recent items.

  The app only reads and writes files the user explicitly opens or saves. It makes no network requests, collects no personal data, has no telemetry, and runs no background tasks, services or elevated processes.
  ```

- **Packages:** `windows/dist/md-writer_1.0.0.0.msixbundle`.

If certification objects to naming CLAUDE.md, a file-name convention that
contains another company's product name, drop it from the description and the
second screenshot caption. AGENTS.md alone carries the same idea.
