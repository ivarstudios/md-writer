using Microsoft.UI.Xaml;
using Microsoft.Windows.AppLifecycle;

namespace MdWriter;

public partial class App : Application
{
    readonly string? path;
    EditorWindow? window;

    public App(string? path)
    {
        this.path = path;
        InitializeComponent();
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        window = new EditorWindow(path);
        window.Activate();

        // Another launch for the file this window holds was redirected here: surface it.
        AppInstance.GetCurrent().Activated += (_, _) =>
            window.DispatcherQueue.TryEnqueue(window.BringToFront);

        _ = JumpLists.SetUpAsync();
    }
}
