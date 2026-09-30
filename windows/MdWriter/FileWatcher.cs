using Microsoft.UI.Dispatching;

namespace MdWriter;

// Watches one file for changes made by other programs, including editors and
// agents that save by writing a temp file and renaming it over the original.
// Bursts of events collapse into one callback on the UI thread.
sealed class FileWatcher : IDisposable
{
    readonly DispatcherQueue queue;
    readonly DispatcherQueueTimer timer;
    FileSystemWatcher? watcher;
    string? name;
    int retries;

    public FileWatcher(DispatcherQueue queue, Action changed)
    {
        this.queue = queue;
        timer = queue.CreateTimer();
        timer.Interval = TimeSpan.FromMilliseconds(250);
        timer.IsRepeating = false;
        timer.Tick += (_, _) => changed();
    }

    public void Watch(string path)
    {
        watcher?.Dispose();
        name = Path.GetFileName(path);
        try
        {
            watcher = new FileSystemWatcher(Path.GetDirectoryName(path)!)
            {
                NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite | NotifyFilters.Size,
                IncludeSubdirectories = false,
            };
            watcher.Changed += (_, e) => { if (Matches(e.Name)) Poke(); };
            watcher.Created += (_, e) => { if (Matches(e.Name)) Poke(); };
            watcher.Deleted += (_, e) => { if (Matches(e.Name)) Poke(); };
            watcher.Renamed += (_, e) => { if (Matches(e.Name) || Matches(e.OldName)) Poke(); };
            watcher.Error += (_, _) => Poke();
            watcher.EnableRaisingEvents = true;
        }
        catch (Exception)
        {
            // Some network locations can't be watched; the file still opens and saves.
            watcher = null;
        }
    }

    // The file was busy (still being written): look again shortly, a few times.
    public void Retry()
    {
        if (++retries > 10) return;
        timer.Stop();
        timer.Start();
    }

    bool Matches(string? changed) => string.Equals(changed, name, StringComparison.OrdinalIgnoreCase);

    void Poke() => queue.TryEnqueue(() =>
    {
        retries = 0;
        timer.Stop();
        timer.Start();
    });

    public void Dispose()
    {
        watcher?.Dispose();
        timer.Stop();
    }
}
