using Windows.UI.StartScreen;

namespace MdWriter;

// Taskbar jump list: recent files (kept by the shell) and a New window task.
static class JumpLists
{
    public static void AddRecent(string path)
    {
        try { Native.SHAddToRecentDocs(Native.SHARD_PATHW, path); }
        catch (Exception) { }
    }

    public static async Task SetUpAsync()
    {
        try
        {
            if (!JumpList.IsSupported()) return;
            var list = await JumpList.LoadCurrentAsync();
            list.SystemGroupKind = JumpListSystemGroupKind.Recent;
            list.Items.Clear();
            var item = JumpListItem.CreateWithArguments("--new", "New window");
            item.Logo = new Uri("ms-appx:///Assets/Square44x44Logo.png");
            list.Items.Add(item);
            await list.SaveAsync();
        }
        catch (Exception) { }
    }
}
