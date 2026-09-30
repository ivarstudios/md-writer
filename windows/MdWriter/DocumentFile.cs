using System.Globalization;
using System.Text;

namespace MdWriter;

// A text file as it sits on disk. The page only ever sees \n newlines; saving
// puts back the file's own encoding, byte order mark and newline style, so an
// untouched file saves byte for byte.
sealed class DocumentFile
{
    public const long MaxBytes = 25 * 1024 * 1024;

    static readonly Encoding Utf8 = new UTF8Encoding(false, true);

    public required string Path { get; init; }
    public required string Text { get; init; }
    public required Encoding Encoding { get; init; }
    public required bool Bom { get; init; }
    public required string Newline { get; init; }

    static DocumentFile() => Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

    public static DocumentFile Load(string path)
    {
        byte[] bytes;
        using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
        {
            if (stream.Length > MaxBytes)
                throw new InvalidDataException(
                    $"It's {stream.Length / (1024 * 1024)} MB, and md-writer opens files up to {MaxBytes / (1024 * 1024)} MB.");
            using var buffer = new MemoryStream();
            stream.CopyTo(buffer);
            bytes = buffer.ToArray();
        }

        var (encoding, bomLength) = Detect(bytes);
        if (bomLength == 0 && Array.IndexOf(bytes, (byte)0) >= 0)
            throw new InvalidDataException("It doesn't look like a text file.");
        var raw = encoding.GetString(bytes, bomLength, bytes.Length - bomLength);

        int crlf = 0, lf = 0;
        for (int i = 0; i < raw.Length; i++)
            if (raw[i] == '\n') { if (i > 0 && raw[i - 1] == '\r') crlf++; else lf++; }

        return new DocumentFile
        {
            Path = path,
            Text = raw.Replace("\r\n", "\n").Replace('\r', '\n'),
            Encoding = encoding,
            Bom = bomLength > 0,
            Newline = crlf > lf ? "\r\n" : "\n",
        };
    }

    // Writes text (with \n newlines) in the format of `like`, or as UTF-8 with \n for a new file.
    public static DocumentFile Save(string path, string text, DocumentFile? like)
    {
        var encoding = like?.Encoding ?? Utf8;
        var bom = like?.Bom ?? false;
        var newline = like?.Newline ?? "\n";
        var body = newline == "\n" ? text : text.Replace("\n", newline);

        byte[] bytes;
        try
        {
            bytes = encoding.GetBytes(body);
        }
        catch (EncoderFallbackException)
        {
            // A legacy code page can't hold what was typed; UTF-8 can.
            encoding = Utf8;
            bom = false;
            bytes = encoding.GetBytes(body);
        }

        // Write over the existing file rather than replacing it, so links, permissions
        // and attributes survive, and truncate last so it's never seen empty.
        using (var stream = new FileStream(path, FileMode.OpenOrCreate, FileAccess.Write, FileShare.Read))
        {
            if (bom) stream.Write(encoding.GetPreamble());
            stream.Write(bytes);
            stream.SetLength(stream.Position);
        }

        return new DocumentFile { Path = path, Text = text, Encoding = encoding, Bom = bom, Newline = newline };
    }

    static (Encoding, int) Detect(byte[] b)
    {
        if (b.Length >= 3 && b[0] == 0xEF && b[1] == 0xBB && b[2] == 0xBF)
            return (new UTF8Encoding(true, true), 3);
        if (b.Length >= 2 && b[0] == 0xFF && b[1] == 0xFE)
            return (new UnicodeEncoding(false, true, true), 2);
        if (b.Length >= 2 && b[0] == 0xFE && b[1] == 0xFF)
            return (new UnicodeEncoding(true, true, true), 2);
        try
        {
            Utf8.GetCharCount(b);
            return (Utf8, 0);
        }
        catch (DecoderFallbackException)
        {
            var codePage = CultureInfo.CurrentCulture.TextInfo.ANSICodePage;
            return (Encoding.GetEncoding(codePage, EncoderFallback.ExceptionFallback, DecoderFallback.ReplacementFallback), 0);
        }
    }

    public static string Describe(Exception ex) => ex switch
    {
        UnauthorizedAccessException => "The file is read-only, or you don't have permission to change it.",
        FileNotFoundException or DirectoryNotFoundException => "The file or its folder no longer exists.",
        IOException io when (io.HResult & 0xFFFF) is 32 or 33 => "Another program has the file locked.",
        _ => ex.Message,
    };
}
