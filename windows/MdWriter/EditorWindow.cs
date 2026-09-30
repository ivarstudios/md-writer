using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.UI;
using Microsoft.UI.Composition.SystemBackdrops;
using Microsoft.UI.Input;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.Web.WebView2.Core;
using Microsoft.Windows.AppLifecycle;
using Windows.Graphics;
using Windows.Storage;
using Windows.Storage.Pickers;
using Windows.System;
using Windows.UI;
using WinRT.Interop;

namespace MdWriter;

// One window, one document. The page (the same index.html as the web version)
// does all the editing; this side owns the file, the window and the title bar.
sealed class EditorWindow : Window
{
    const string HostName = "md-writer.example";
    const string Origin = "https://" + HostName + "/";
    static readonly string WebRoot = Path.Combine(AppContext.BaseDirectory, "web");

    static readonly HashSet<string> MenuClutter =
    [
        "back", "forward", "reload", "saveAs", "print", "createQrCode", "share", "sendPageToDevices",
        "webCapture", "inspectElement", "openLinkInNewWindow", "copyLinkLocation", "saveImageAs",
        "copyImage", "copyImageLocation", "saveLinkAs",
    ];

    readonly Grid root = new();
    readonly WebView2 web = new();
    readonly FileWatcher watcher;
    readonly IntPtr hwnd;

    string? startPath;
    DocumentFile? doc;
    bool pageReady, dirty, missing, dark, fullscreen, closeConfirmed, dialogOpen;
    (double Height, double X, double Y, double W, double H) titleBar = (48, 0, 0, 0, 0);

    public EditorWindow(string? path)
    {
        startPath = path;
        hwnd = WindowNative.GetWindowHandle(this);
        watcher = new FileWatcher(DispatcherQueue, OnDiskChanged);

        dark = Settings.LastDark ?? Application.Current.RequestedTheme == ApplicationTheme.Dark;
        root.RequestedTheme = dark ? ElementTheme.Dark : ElementTheme.Light;
        root.Children.Add(web);
        Content = root;

        // Extended through AppWindow rather than Window, so XAML leaves the drag regions to UpdateTitleBarRegions.
        AppWindow.TitleBar.ExtendsContentIntoTitleBar = true;
        AppWindow.TitleBar.PreferredHeightOption = TitleBarHeightOption.Tall;
        if (MicaController.IsSupported())
            SystemBackdrop = new MicaBackdrop();
        ApplyCaptionColors();
        var icon = Path.Combine(AppContext.BaseDirectory, "Assets", "app.ico");
        if (File.Exists(icon))
            AppWindow.SetIcon(icon);
        AppWindow.Title = "md-writer";
        RestoreSize();

        AppWindow.Closing += OnClosing;
        AppWindow.Changed += (_, e) =>
        {
            if (e.DidSizeChange || e.DidPresenterChange)
            {
                fullscreen = AppWindow.Presenter.Kind == AppWindowPresenterKind.FullScreen;
                PostChrome();
                UpdateTitleBarRegions();
            }
        };
        Activated += (_, e) =>
        {
            if (e.WindowActivationState != WindowActivationState.Deactivated)
                web.Focus(FocusState.Programmatic);
        };
        Closed += (_, _) => watcher.Dispose();
        root.Loaded += async (_, _) => await InitWebViewAsync();
    }

    double Scale => Native.GetDpiForWindow(hwnd) / 96.0;

    // ---------- web view ----------

    async Task InitWebViewAsync()
    {
        try
        {
            var userData = Path.Combine(ApplicationData.Current.LocalFolder.Path, "WebView2");
            var env = await CoreWebView2Environment.CreateWithOptionsAsync(null, userData, new CoreWebView2EnvironmentOptions());
            await web.EnsureCoreWebView2Async(env);
        }
        catch (Exception)
        {
            var choice = await AskAsync("md-writer needs Microsoft WebView2",
                "It comes with Windows 11 and recent Windows 10 updates, but it's missing here. " +
                "Install it from Microsoft, then open md-writer again.", "Get WebView2", null, "Close");
            if (choice == ContentDialogResult.Primary)
                await Launcher.LaunchUriAsync(new Uri("https://go.microsoft.com/fwlink/p/?LinkId=2124703"));
            closeConfirmed = true;
            Close();
            return;
        }

        var core = web.CoreWebView2;
        var settings = core.Settings;
#if !DEBUG
        settings.AreDevToolsEnabled = false;
#endif
        settings.AreBrowserAcceleratorKeysEnabled = false;
        settings.IsZoomControlEnabled = false;
        settings.IsPinchZoomEnabled = false;
        settings.IsStatusBarEnabled = false;
        settings.IsSwipeNavigationEnabled = false;
        settings.IsGeneralAutofillEnabled = false;
        settings.IsPasswordAutosaveEnabled = false;
        settings.AreHostObjectsAllowed = false;

        core.SetVirtualHostNameToFolderMapping(HostName, WebRoot, CoreWebView2HostResourceAccessKind.Allow);
        // The page's web font request goes nowhere: the app sets type in the system's Georgia, and stays offline.
        core.AddWebResourceRequestedFilter("https://fonts.googleapis.com/*", CoreWebView2WebResourceContext.All);
        core.AddWebResourceRequestedFilter("https://fonts.gstatic.com/*", CoreWebView2WebResourceContext.All);
        core.WebResourceRequested += (_, e) =>
            e.Response = core.Environment.CreateWebResourceResponse(null, 404, "Not Found", "");

        core.NavigationStarting += (_, e) =>
        {
            if (e.Uri.StartsWith(Origin, StringComparison.OrdinalIgnoreCase)) return;
            e.Cancel = true;
            OpenInBrowser(e.Uri);
        };
        core.NewWindowRequested += (_, e) =>
        {
            e.Handled = true;
            OpenInBrowser(e.Uri);
        };
        core.ContextMenuRequested += (_, e) => TrimContextMenu(e.MenuItems);
        core.DocumentTitleChanged += (_, _) => AppWindow.Title = core.DocumentTitle + " - md-writer";
        core.WebMessageReceived += OnWebMessage;
        core.ProcessFailed += (_, e) =>
        {
            if (e.ProcessFailedKind is not (CoreWebView2ProcessFailedKind.RenderProcessExited
                or CoreWebView2ProcessFailedKind.RenderProcessUnresponsive)) return;
            // Unsaved edits are gone with the renderer; bring the file back as it is on disk.
            startPath = doc?.Path;
            doc = null;
            pageReady = dirty = false;
            core.Reload();
        };

        var hostInfo = new JsonObject
        {
            ["backdrop"] = MicaController.IsSupported() ? "mica" : "none",
            ["captionInset"] = CaptionInset(),
        };
        await core.AddScriptToExecuteOnDocumentCreatedAsync($"window.mdHost = {hostInfo.ToJsonString()};");
        core.Navigate(Origin + "index.html");
    }

    static void TrimContextMenu(IList<CoreWebView2ContextMenuItem> items)
    {
        for (int i = items.Count - 1; i >= 0; i--)
            if (MenuClutter.Contains(items[i].Name))
                items.RemoveAt(i);
        // Drop separators left leading, trailing or doubled.
        for (int i = items.Count - 1; i >= 0; i--)
        {
            if (items[i].Kind != CoreWebView2ContextMenuItemKind.Separator) continue;
            if (i == 0 || i == items.Count - 1 || items[i - 1].Kind == CoreWebView2ContextMenuItemKind.Separator)
                items.RemoveAt(i);
        }
    }

    void Post(JsonObject message) => web.CoreWebView2?.PostWebMessageAsJson(message.ToJsonString());

    async Task<string> EvalStringAsync(string script) =>
        JsonNode.Parse(await web.CoreWebView2.ExecuteScriptAsync(script))?.GetValue<string>() ?? "";

    async void OnWebMessage(CoreWebView2 sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        using var json = JsonDocument.Parse(e.WebMessageAsJson);
        var m = json.RootElement;
        switch (m.GetProperty("type").GetString())
        {
            case "ready":
                pageReady = true;
                PostChrome();
                if (startPath != null)
                {
                    var path = startPath;
                    startPath = null;
                    OpenHere(path);
                }
                break;
            case "dirty":
                dirty = m.GetProperty("dirty").GetBoolean();
                break;
            case "theme":
                ApplyTheme(m.GetProperty("dark").GetBoolean());
                break;
            case "titlebar":
                titleBar = (m.GetProperty("height").GetDouble(), m.GetProperty("x").GetDouble(),
                    m.GetProperty("y").GetDouble(), m.GetProperty("w").GetDouble(), m.GetProperty("h").GetDouble());
                UpdateTitleBarRegions();
                break;
            case "save":
                await SaveAsync(m.GetProperty("text").GetString() ?? "", m.GetProperty("saveAs").GetBoolean());
                break;
            case "open":
                await PickAndOpenAsync();
                break;
            case "drop":
                foreach (var file in e.AdditionalObjects.OfType<CoreWebView2File>())
                    Open(file.Path);
                break;
            case "new":
                SpawnProcess(null);
                break;
            case "close":
                await CloseAsync();
                break;
            case "fullscreen":
                AppWindow.SetPresenter(fullscreen ? AppWindowPresenterKind.Overlapped : AppWindowPresenterKind.FullScreen);
                break;
            case "find":
                await StartFindAsync();
                break;
            case "print":
                sender.ShowPrintUI(CoreWebView2PrintDialogKind.Browser);
                break;
            case "link":
                FollowLink(m.GetProperty("href").GetString());
                break;
            case "styled":
                if (doc != null) Settings.SetStyled(doc.Path, m.GetProperty("on").GetBoolean());
                break;
        }
    }

    // ---------- opening ----------

    // A file the user asked for from this window: here if the window is still blank, else in a new one.
    void Open(string path)
    {
        if (pageReady && doc == null && !dirty) OpenHere(path);
        else SpawnProcess(path);
    }

    void OpenHere(string path)
    {
        // Open elsewhere already? A new process will be redirected to that window.
        if (!AppInstance.FindOrRegisterForKey(Program.DocumentKey(path)).IsCurrent)
        {
            SpawnProcess(path);
            return;
        }

        try
        {
            doc = DocumentFile.Load(path);
        }
        catch (Exception ex)
        {
            AppInstance.GetCurrent().UnregisterKey();
            _ = AskAsync($"Couldn't open {Path.GetFileName(path)}", DocumentFile.Describe(ex), null, null, "OK");
            return;
        }

        var kind = FileTypes.KindOf(path);
        Post(new JsonObject
        {
            ["type"] = "load",
            ["text"] = doc.Text,
            ["name"] = Path.GetFileName(path),
            ["styled"] = Settings.GetStyled(path) ?? kind == FileKind.Markdown,
            ["toggle"] = kind != FileKind.Markdown,
            ["mono"] = kind == FileKind.Log,
        });
        missing = false;
        watcher.Watch(path);
        JumpLists.AddRecent(path);
    }

    async Task PickAndOpenAsync()
    {
        var picker = new FileOpenPicker();
        InitializeWithWindow.Initialize(picker, hwnd);
        foreach (var ext in FileTypes.AllExtensions)
            picker.FileTypeFilter.Add(ext);
        var files = await picker.PickMultipleFilesAsync();
        foreach (var file in files)
            Open(file.Path);
    }

    public static void SpawnProcess(string? path)
    {
        var start = new ProcessStartInfo(Environment.ProcessPath!) { UseShellExecute = false };
        if (path != null) start.ArgumentList.Add(path);
        Process.Start(start);
    }

    void FollowLink(string? href)
    {
        if (string.IsNullOrWhiteSpace(href)) return;
        if (Uri.TryCreate(href, UriKind.Absolute, out var uri) && !uri.IsFile)
        {
            OpenInBrowser(href);
            return;
        }
        // A link to another local text file opens it in its own window.
        string target;
        try
        {
            if (uri?.IsFile == true)
                target = uri.LocalPath;
            else if (doc != null)
                target = Path.GetFullPath(Path.Combine(Path.GetDirectoryName(doc.Path)!,
                    Uri.UnescapeDataString(href.Split('#', '?')[0]).Replace('/', '\\')));
            else
                return;
        }
        catch (Exception)
        {
            return;
        }
        if (File.Exists(target) && FileTypes.IsSupported(target))
            Open(target);
    }

    static void OpenInBrowser(string url)
    {
        if (Uri.TryCreate(url, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https" or "mailto")
            _ = Launcher.LaunchUriAsync(uri);
    }

    // ---------- saving ----------

    async Task<bool> SaveAsync(string text, bool saveAs)
    {
        var path = doc?.Path;
        if (path == null || saveAs)
        {
            path = await PickSavePathAsync(path);
            if (path == null)
            {
                Post(new JsonObject { ["type"] = "save-failed" });
                return false;
            }
        }

        try
        {
            var moved = doc == null || !string.Equals(doc.Path, path, StringComparison.OrdinalIgnoreCase);
            doc = DocumentFile.Save(path, text, doc);
            missing = false;
            if (moved)
            {
                AppInstance.GetCurrent().UnregisterKey();
                AppInstance.FindOrRegisterForKey(Program.DocumentKey(path));
                watcher.Watch(path);
            }
            JumpLists.AddRecent(path);
            Post(new JsonObject { ["type"] = "saved", ["name"] = Path.GetFileName(path) });
            return true;
        }
        catch (Exception ex)
        {
            Post(new JsonObject { ["type"] = "save-failed" });
            var choice = await AskAsync($"Couldn't save {Path.GetFileName(path)}", DocumentFile.Describe(ex),
                "Save as…", null, "Cancel");
            return choice == ContentDialogResult.Primary && await SaveAsync(text, true);
        }
    }

    async Task<string?> PickSavePathAsync(string? current)
    {
        var name = current != null ? Path.GetFileName(current) : "untitled.md";
        var ext = Path.GetExtension(name);
        var picker = new FileSavePicker { SuggestedFileName = Path.GetFileNameWithoutExtension(name) };
        InitializeWithWindow.Initialize(picker, hwnd);
        // The current file's own type comes first, so it's the default.
        var kind = FileTypes.KindOf(name);
        foreach (var group in FileTypes.Groups.OrderBy(g => g.Kind != kind))
            picker.FileTypeChoices.Add(group.Label, group.Kind == kind && ext != ""
                ? group.Extensions.OrderBy(x => !x.Equals(ext, StringComparison.OrdinalIgnoreCase)).ToList()
                : group.Extensions.ToList());
        var file = await picker.PickSaveFileAsync();
        return file?.Path;
    }

    // ---------- the file changing on disk ----------

    void OnDiskChanged()
    {
        if (doc == null || !pageReady) return;
        if (!File.Exists(doc.Path))
        {
            if (!missing) Post(new JsonObject { ["type"] = "deleted" });
            missing = true;
            return;
        }

        DocumentFile fresh;
        try
        {
            fresh = DocumentFile.Load(doc.Path);
        }
        catch (IOException)
        {
            watcher.Retry();
            return;
        }
        catch (Exception)
        {
            return;
        }

        var changed = missing || fresh.Text != doc.Text;
        missing = false;
        doc = fresh;
        // The page decides: reload in place if it has no unsaved edits, otherwise ask.
        if (changed) Post(new JsonObject { ["type"] = "changed", ["text"] = fresh.Text });
    }

    // ---------- closing ----------

    async void OnClosing(AppWindow sender, AppWindowClosingEventArgs e)
    {
        if (closeConfirmed || !dirty)
        {
            SaveSize();
            return;
        }
        e.Cancel = true;
        await CloseAsync();
    }

    async Task CloseAsync()
    {
        if (dirty && !await ConfirmDiscardOrSaveAsync()) return;
        closeConfirmed = true;
        SaveSize();
        Close();
    }

    async Task<bool> ConfirmDiscardOrSaveAsync()
    {
        var name = doc != null ? Path.GetFileName(doc.Path) : "untitled.md";
        var choice = await AskAsync($"Save changes to {name}?", "Your changes will be lost if you don't save them.",
            "Save", "Don't save", "Cancel");
        if (choice == ContentDialogResult.Secondary) return true;
        if (choice != ContentDialogResult.Primary) return false;
        var text = await EvalStringAsync("getText()");
        return await SaveAsync(text, false);
    }

    // ---------- window chrome ----------

    public void BringToFront()
    {
        if (AppWindow.Presenter is OverlappedPresenter { State: OverlappedPresenterState.Minimized } presenter)
            presenter.Restore();
        Activate();
        Native.SetForegroundWindow(hwnd);
    }

    double CaptionInset() => fullscreen ? 0 : Math.Ceiling(AppWindow.TitleBar.RightInset / Scale);

    void PostChrome()
    {
        if (pageReady)
            Post(new JsonObject { ["type"] = "chrome", ["captionInset"] = CaptionInset(), ["fullscreen"] = fullscreen });
    }

    // The page's header is the title bar: all of it drags the window, except the buttons.
    void UpdateTitleBarRegions()
    {
        var source = InputNonClientPointerSource.GetForWindowId(AppWindow.Id);
        if (fullscreen)
        {
            source.ClearRegionRects(NonClientRegionKind.Caption);
            source.ClearRegionRects(NonClientRegionKind.Passthrough);
            return;
        }
        var s = Scale;
        var width = AppWindow.ClientSize.Width - AppWindow.TitleBar.RightInset;
        source.SetRegionRects(NonClientRegionKind.Caption,
            [new RectInt32(0, 0, Math.Max(0, width), (int)Math.Round(titleBar.Height * s))]);
        source.SetRegionRects(NonClientRegionKind.Passthrough,
            [new RectInt32((int)Math.Floor(titleBar.X * s), (int)Math.Floor(titleBar.Y * s),
                (int)Math.Ceiling(titleBar.W * s), (int)Math.Ceiling(titleBar.H * s))]);    }

    void ApplyTheme(bool isDark)
    {
        dark = isDark;
        Settings.LastDark = isDark;
        root.RequestedTheme = isDark ? ElementTheme.Dark : ElementTheme.Light;
        ApplyCaptionColors();
    }

    // Caption buttons in the page's own muted ink, so they read as part of the header.
    void ApplyCaptionColors()
    {
        var bar = AppWindow.TitleBar;
        var ink = dark ? Color.FromArgb(255, 0xdc, 0xd9, 0xd3) : Color.FromArgb(255, 0x1c, 0x1b, 0x19);
        bar.ButtonBackgroundColor = Colors.Transparent;
        bar.ButtonInactiveBackgroundColor = Colors.Transparent;
        bar.ButtonForegroundColor = dark ? Color.FromArgb(255, 0x8f, 0x8c, 0x85) : Color.FromArgb(255, 0x6e, 0x6a, 0x63);
        bar.ButtonInactiveForegroundColor = dark ? Color.FromArgb(255, 0x4e, 0x4c, 0x47) : Color.FromArgb(255, 0xb8, 0xb2, 0xa7);
        bar.ButtonHoverForegroundColor = ink;
        bar.ButtonHoverBackgroundColor = dark ? Color.FromArgb(16, 255, 255, 255) : Color.FromArgb(13, 0, 0, 0);
        bar.ButtonPressedForegroundColor = ink;
        bar.ButtonPressedBackgroundColor = dark ? Color.FromArgb(28, 255, 255, 255) : Color.FromArgb(24, 0, 0, 0);
    }

    void RestoreSize()
    {
        var s = Scale;
        var work = DisplayArea.GetFromWindowId(AppWindow.Id, DisplayAreaFallback.Primary).WorkArea;
        var (w, h) = Settings.WindowSize ?? (1000, work.Height * 0.9 / s);
        var width = (int)Math.Min(w * s, work.Width);
        var height = (int)Math.Min(h * s, work.Height);
        var pos = AppWindow.Position;
        AppWindow.MoveAndResize(new RectInt32(
            Math.Clamp(pos.X, work.X, work.X + work.Width - width),
            Math.Clamp(pos.Y, work.Y, work.Y + work.Height - height),
            width, height));
        if (Settings.WindowMaximized && AppWindow.Presenter is OverlappedPresenter presenter)
            presenter.Maximize();
    }

    void SaveSize()
    {
        if (fullscreen || AppWindow.Presenter is not OverlappedPresenter presenter) return;
        Settings.WindowMaximized = presenter.State == OverlappedPresenterState.Maximized;
        if (presenter.State == OverlappedPresenterState.Restored)
            Settings.WindowSize = (AppWindow.Size.Width / Scale, AppWindow.Size.Height / Scale);
    }

    async Task StartFindAsync()
    {
        var core = web.CoreWebView2;
        var options = core.Environment.CreateFindOptions();
        options.FindTerm = await EvalStringAsync("getSelection().toString()");
        options.SuppressDefaultFindDialog = false;
        await core.Find.StartAsync(options);
    }

    async Task<ContentDialogResult> AskAsync(string title, string body, string? primary, string? secondary, string close)
    {
        if (dialogOpen) return ContentDialogResult.None;
        dialogOpen = true;
        try
        {
            var dialog = new ContentDialog
            {
                XamlRoot = root.XamlRoot,
                Style = (Style)Application.Current.Resources["DefaultContentDialogStyle"],
                RequestedTheme = root.RequestedTheme,
                Title = title,
                Content = body,
                PrimaryButtonText = primary ?? "",
                SecondaryButtonText = secondary ?? "",
                CloseButtonText = close,
                DefaultButton = primary != null ? ContentDialogButton.Primary : ContentDialogButton.Close,
            };
            return await dialog.ShowAsync();
        }
        finally
        {
            dialogOpen = false;
        }
    }
}
