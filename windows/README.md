# md-writer for Windows

The native Windows app: a small WinUI 3 shell around the same `index.html` the
web version serves, packaged as MSIX for the Microsoft Store.

The page does all the editing, exactly as on the web. The shell adds what a
browser tab can't:

- **Open with.** Registers for `.md .markdown .mdown .mkd .mdx`, `.txt .text`,
  `.log .todo .nfo` and `.rst .adoc .org`, so they're one right-click away. It
  never makes itself the default app.
- **One window per file.** Opening a file that's already open brings its
  window forward. Ctrl+N opens a blank window, and Ctrl+W closes one.
- **Saves in place, byte for byte.** Keeps each file's encoding (UTF-8, UTF-8
  with BOM, UTF-16, legacy code pages) and its CRLF or LF newlines.
- **Live reload.** When another program changes the open file, the view
  updates. If there are unsaved edits, it asks first. Reloads can be undone,
  and a file that grows at the end, like a log, stays scrolled to the end.
- **Plain text stays plain.** Non-markdown files open without markdown
  styling. The header gets a toggle for turning it on, and the choice is
  remembered per file.
- **Fully offline.** Text is set in Georgia, which every Windows install has,
  instead of the web version's Libertinus Serif. The page's web font request
  is blocked, so the app never touches the network.
- **Windows 11 chrome.** A Mica backdrop, and the page header doubles as the
  title bar. Also: taskbar jump list with recent files, F11 fullscreen, Ctrl+F
  find, Ctrl+P print, Ctrl+wheel for text size, Ctrl+click to follow a link,
  and `md-writer <file>` from any terminal.

## How it fits together

| File | Role |
| --- | --- |
| `../index.html` | The editor. Detects WebView2 (`window.chrome.webview`) and routes open, save and file events to the host. Nothing changes on the web. |
| `Program.cs` | Entry point. Sends a launch for an already-open file to the window that has it. |
| `EditorWindow.cs` | Window, WebView2 setup, message bridge, dialogs, title bar. |
| `DocumentFile.cs` | Reads and writes files, detecting and preserving the encoding and newlines. |
| `FileWatcher.cs` | Debounced watcher that survives saves done by rename (editors, agents). |
| `Package.appxmanifest` | Identity, file associations, `md-writer` command alias. |

Bridge messages, page → host: `ready dirty theme titlebar save open drop new
close fullscreen find print link styled`. Host → page: `load changed deleted
saved save-failed chrome`.

## Building

You need the .NET 10 SDK. NuGet restores everything else, and Visual Studio is
optional.

```powershell
.\build.ps1 -Dev    # Debug build, registered on this PC (needs Developer Mode)
.\build.ps1         # Release x64 + ARM64 → dist\md-writer_<version>.msixbundle
```

Release builds trim the bundled .NET runtime, which makes each package about
14 MB instead of 56 MB. The icon comes from `docs/icon/md-writer-icon.svg`
(see [docs/icon/icon-design.md](../docs/icon/icon-design.md)).
`tools\New-AppIcon.ps1` rebuilds `app.ico` and the MSIX logos from it.

The app depends on the Windows App Runtime 2.x framework package, which the
Store installs automatically. For `-Dev` it's usually already on the machine.
If not: `winget install Microsoft.WindowsAppRuntime.2`.

To publish, see [STORE.md](STORE.md).
