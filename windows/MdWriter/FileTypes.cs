namespace MdWriter;

enum FileKind { Markdown, Text, Log, Markup }

// Keep in step with the file type associations in Package.appxmanifest.
static class FileTypes
{
    public static readonly (FileKind Kind, string Label, string[] Extensions)[] Groups =
    [
        (FileKind.Markdown, "Markdown", [".md", ".markdown", ".mdown", ".mkd", ".mdx"]),
        (FileKind.Text, "Plain text", [".txt", ".text"]),
        (FileKind.Log, "Log or notes", [".log", ".todo", ".nfo"]),
        (FileKind.Markup, "Light markup", [".rst", ".adoc", ".org"]),
    ];

    public static IEnumerable<string> AllExtensions => Groups.SelectMany(g => g.Extensions);

    public static bool IsSupported(string path) =>
        AllExtensions.Contains(Path.GetExtension(path), StringComparer.OrdinalIgnoreCase);

    public static FileKind KindOf(string path)
    {
        var ext = Path.GetExtension(path);
        foreach (var group in Groups)
            if (group.Extensions.Contains(ext, StringComparer.OrdinalIgnoreCase))
                return group.Kind;
        return FileKind.Text;
    }
}
