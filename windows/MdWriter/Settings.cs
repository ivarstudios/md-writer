using System.Text.Json.Nodes;
using Windows.Storage;

namespace MdWriter;

// App state that outlives a window. The page keeps its own preferences
// (theme, font, size) in WebView2's localStorage, exactly as on the web.
static class Settings
{
    const int MaxStyledFiles = 500;

    static readonly ApplicationDataContainer Local = ApplicationData.Current.LocalSettings;
    static readonly string StyledPath = Path.Combine(ApplicationData.Current.LocalFolder.Path, "styled-files.json");

    public static bool? LastDark
    {
        get => Local.Values["dark"] as bool?;
        set => Local.Values["dark"] = value;
    }

    // Window size in device-independent pixels.
    public static (double Width, double Height)? WindowSize
    {
        get => Local.Values["width"] is double w && Local.Values["height"] is double h ? (w, h) : null;
        set
        {
            Local.Values["width"] = value?.Width;
            Local.Values["height"] = value?.Height;
        }
    }

    public static bool WindowMaximized
    {
        get => Local.Values["maximized"] as bool? ?? false;
        set => Local.Values["maximized"] = value;
    }

    // Plain text files where the reader turned markdown styling on (or a markdown file off).
    public static bool? GetStyled(string path) =>
        LoadStyled()[Key(path)]?.GetValue<bool>();

    public static void SetStyled(string path, bool on)
    {
        try
        {
            var map = LoadStyled();
            map.Remove(Key(path));
            map[Key(path)] = on;
            while (map.Count > MaxStyledFiles)
                map.Remove(map.First().Key);
            File.WriteAllText(StyledPath, map.ToJsonString());
        }
        catch (Exception) { }
    }

    static JsonObject LoadStyled()
    {
        try
        {
            if (File.Exists(StyledPath) && JsonNode.Parse(File.ReadAllText(StyledPath)) is JsonObject map)
                return map;
        }
        catch (Exception) { }
        return [];
    }

    static string Key(string path) => Path.GetFullPath(path).ToLowerInvariant();
}
