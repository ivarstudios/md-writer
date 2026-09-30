using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using Microsoft.Windows.AppLifecycle;
using Windows.ApplicationModel.Activation;

namespace MdWriter;

// One process and one window per file. A launch for a file that's already open
// is redirected to the process that has it, which brings its window forward.
public static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        WinRT.ComWrappersSupport.InitializeComWrappers();

        // Let the Mica backdrop show through the page.
        Environment.SetEnvironmentVariable("WEBVIEW2_DEFAULT_BACKGROUND_COLOR", "00000000");

        var activation = AppInstance.GetCurrent().GetActivatedEventArgs();
        var paths = LaunchPaths(activation, args);
        foreach (var extra in paths.Skip(1))
            EditorWindow.SpawnProcess(extra);

        var path = paths.FirstOrDefault();
        if (path != null && RedirectToOwner(path, activation))
            return;

        Application.Start(p =>
        {
            SynchronizationContext.SetSynchronizationContext(
                new DispatcherQueueSynchronizationContext(DispatcherQueue.GetForCurrentThread()));
            _ = new App(path);
        });
    }

    public static string DocumentKey(string path) => "doc:" + Path.GetFullPath(path).ToLowerInvariant();

    static List<string> LaunchPaths(AppActivationArguments activation, string[] args)
    {
        if (activation.Kind == ExtendedActivationKind.File && activation.Data is IFileActivatedEventArgs file)
            return file.Files.Select(f => f.Path).Where(p => !string.IsNullOrEmpty(p)).ToList();

        var paths = new List<string>();
        foreach (var arg in args.Where(a => !a.StartsWith("--")))
        {
            try { paths.Add(Path.GetFullPath(arg)); }
            catch (Exception) { }
        }
        return paths;
    }

    static bool RedirectToOwner(string path, AppActivationArguments activation)
    {
        var owner = AppInstance.FindOrRegisterForKey(DocumentKey(path));
        if (owner.IsCurrent)
            return false;

        Native.AllowSetForegroundWindow(owner.ProcessId);
        // Redirect on a worker thread while this STA thread keeps pumping COM,
        // as the Windows App SDK instancing docs prescribe.
        var done = Native.CreateEvent(IntPtr.Zero, true, false, null);
        Task.Run(() =>
        {
            owner.RedirectActivationToAsync(activation).AsTask().Wait();
            Native.SetEvent(done);
        });
        Native.CoWaitForMultipleObjects(0, 0xFFFFFFFF, 1, [done], out _);
        return true;
    }
}
