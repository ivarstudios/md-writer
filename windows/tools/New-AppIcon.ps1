<#
.SYNOPSIS
  Builds the md-writer icon files from docs\icon\md-writer-icon.svg.

.DESCRIPTION
  - docs\icon\md-writer-icon.png: the SVG drawn 2000 px high by Microsoft Edge (headless, on a transparent
    background). Everything below is made from it. It's kept in git, so -SkipRender rebuilds without Edge.
  - windows\MdWriter\Assets\app.ico: the icon as is (dark ink, white inside the hexagon), 16 to 256 px.
  - windows\MdWriter\Assets\*.png: the MSIX logos for Start, the taskbar, the Store, tiles and splash, with the
    scale and target-size variants Windows picks from.

  The same pipeline as IVAR Ingest's tools\New-AppIcon.ps1.
#>
param(
    [string] $Svg = (Join-Path $PSScriptRoot '..\..\docs\icon\md-writer-icon.svg'),
    [string] $Rendered = (Join-Path $PSScriptRoot '..\..\docs\icon\md-writer-icon.png'),
    [string] $Assets = (Join-Path $PSScriptRoot '..\MdWriter\Assets'),
    [int] $RenderHeight = 2000,
    [switch] $SkipRender
)

$ErrorActionPreference = 'Stop'
$Svg = [IO.Path]::GetFullPath($Svg); $Rendered = [IO.Path]::GetFullPath($Rendered); $Assets = [IO.Path]::GetFullPath($Assets)
New-Item -ItemType Directory -Force $Assets | Out-Null

# ---- The SVG drawn large, on a transparent background ------------------------------------------------------------
if (-not $SkipRender) {
    $edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") |
        Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (-not $edge) { throw 'Microsoft Edge was not found; run with -SkipRender to use the PNG in git.' }
    [xml] $doc = Get-Content -LiteralPath $Svg -Raw
    $box = $doc.svg.viewBox -split '\s+' | ForEach-Object { [double]::Parse($_, [Globalization.CultureInfo]::InvariantCulture) }
    $width = [int][Math]::Round($RenderHeight * $box[2] / $box[3])
    $page = Join-Path ([IO.Path]::GetTempPath()) "md-writer-icon-$PID.html"
    $shot = Join-Path ([IO.Path]::GetTempPath()) "md-writer-icon-$PID.png"
    Set-Content -LiteralPath $page -Encoding UTF8 -Value ("<!doctype html><html><body style=`"margin:0;background:transparent`">" +
        "<img src=`"$(([Uri]$Svg).AbsoluteUri)`" style=`"display:block;width:${width}px;height:${RenderHeight}px`"></body></html>")
    $edgeData = Join-Path ([IO.Path]::GetTempPath()) "md-writer-icon-edge-$PID"
    # Edge reports "... bytes written" on stderr, which Windows PowerShell would take for an error.
    $ErrorActionPreference = 'Continue'
    & $edge --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --default-background-color=00000000 `
        "--user-data-dir=$edgeData" "--window-size=$width,$RenderHeight" "--screenshot=$shot" ([Uri]$page).AbsoluteUri 2>&1 | Out-Null
    $ErrorActionPreference = 'Stop'
    $deadline = (Get-Date).AddSeconds(30)
    while (-not (Test-Path -LiteralPath $shot) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 200 }
    if (-not (Test-Path -LiteralPath $shot)) { throw 'Edge did not draw the icon.' }
    Move-Item -LiteralPath $shot -Destination $Rendered -Force
    Remove-Item -LiteralPath $page -Force
    Remove-Item -LiteralPath $edgeData -Recurse -Force -ErrorAction SilentlyContinue
    "Wrote $Rendered (${width}x$RenderHeight)"
}

Add-Type -AssemblyName System.Drawing
$source = [Drawing.Bitmap]::FromFile($Rendered)

# The hexagon, $height px high, centred on a transparent canvas.
function Draw([int] $height, [int] $canvasWidth, [int] $canvasHeight) {
    $width = [Math]::Max(1, [int][Math]::Round($height * $source.Width / $source.Height))
    $bmp = New-Object Drawing.Bitmap $canvasWidth, $canvasHeight, ([Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [Drawing.Graphics]::FromImage($bmp)
    $g.Clear([Drawing.Color]::Transparent)
    $g.InterpolationMode = 'HighQualityBicubic'
    $g.PixelOffsetMode = 'HighQuality'
    $g.SmoothingMode = 'AntiAlias'
    $g.CompositingQuality = 'HighQuality'
    $attributes = New-Object Drawing.Imaging.ImageAttributes
    $attributes.SetWrapMode([Drawing.Drawing2D.WrapMode]::TileFlipXY) # no dark fringe at the edges
    $x = [int](($canvasWidth - $width) / 2); $y = [int](($canvasHeight - $height) / 2)
    $g.DrawImage($source, (New-Object Drawing.Rectangle $x, $y, $width, $height), 0, 0, $source.Width, $source.Height, 'Pixel', $attributes)
    $g.Dispose()
    $bmp
}

function Save-Png([string] $name, [int] $height, [int] $canvasWidth, [int] $canvasHeight) {
    $bmp = Draw $height $canvasWidth $canvasHeight
    $bmp.Save((Join-Path $Assets $name), [Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

# ---- MSIX logos ---------------------------------------------------------------------------------------------------
# App icon (Start, taskbar, Explorer): the hexagon fills its square, like a classic icon.
foreach ($scale in @{ 100 = 44; 125 = 55; 150 = 66; 200 = 88; 400 = 176 }.GetEnumerator()) {
    Save-Png "Square44x44Logo.scale-$($scale.Key).png" $scale.Value $scale.Value $scale.Value
}
foreach ($size in 16, 20, 24, 32, 48, 256) {
    foreach ($form in '', 'altform-unplated_', 'altform-lightunplated_') {
        Save-Png "Square44x44Logo.${form}targetsize-$size.png" $size $size $size
    }
}
foreach ($scale in @{ 100 = 50; 200 = 100; 400 = 200 }.GetEnumerator()) {
    Save-Png "StoreLogo.scale-$($scale.Key).png" $scale.Value $scale.Value $scale.Value
}
# Tiles and splash: the hexagon with room around it.
foreach ($scale in @{ 100 = 150; 200 = 300; 400 = 600 }.GetEnumerator()) {
    Save-Png "Square150x150Logo.scale-$($scale.Key).png" ([int]($scale.Value * 0.6)) $scale.Value $scale.Value
}
foreach ($scale in @{ 100 = 1; 200 = 2 }.GetEnumerator()) {
    Save-Png "Wide310x150Logo.scale-$($scale.Key).png" (90 * $scale.Value) (310 * $scale.Value) (150 * $scale.Value)
    Save-Png "SplashScreen.scale-$($scale.Key).png" (150 * $scale.Value) (620 * $scale.Value) (300 * $scale.Value)
}
"Wrote MSIX logos to $Assets"

# ---- app.ico ------------------------------------------------------------------------------------------------------
$sizes = 16, 20, 24, 32, 40, 48, 64, 128, 256
$frames = foreach ($size in $sizes) {
    $bmp = Draw $size $size $size
    $ms = New-Object IO.MemoryStream
    if ($size -ge 256) {
        $bmp.Save($ms, [Drawing.Imaging.ImageFormat]::Png)
    }
    else {
        # Classic 32-bit DIB frame (bottom-up BGRA plus a 1-bit AND mask): read by every icon loader.
        $bw = New-Object IO.BinaryWriter $ms
        $maskStride = [int]([Math]::Ceiling($size / 32.0) * 4)
        $bw.Write([uint32]40); $bw.Write([int32]$size); $bw.Write([int32]($size * 2)); $bw.Write([uint16]1); $bw.Write([uint16]32)
        $bw.Write([uint32]0); $bw.Write([uint32]($size * $size * 4 + $maskStride * $size)); $bw.Write([int32]0); $bw.Write([int32]0)
        $bw.Write([uint32]0); $bw.Write([uint32]0)
        for ($y = $size - 1; $y -ge 0; $y--) {
            for ($x = 0; $x -lt $size; $x++) {
                $c = $bmp.GetPixel($x, $y)
                $bw.Write([byte]$c.B); $bw.Write([byte]$c.G); $bw.Write([byte]$c.R); $bw.Write([byte]$c.A)
            }
        }
        $bw.Write((New-Object byte[] ($maskStride * $size))) # all zero: the alpha channel decides
        $bw.Flush()
    }
    $bmp.Dispose()
    , $ms.ToArray()
}

$out = New-Object IO.MemoryStream
$writer = New-Object IO.BinaryWriter $out
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $dim = if ($sizes[$i] -ge 256) { 0 } else { $sizes[$i] }
    $writer.Write([byte]$dim); $writer.Write([byte]$dim); $writer.Write([byte]0); $writer.Write([byte]0)
    $writer.Write([uint16]1); $writer.Write([uint16]32); $writer.Write([uint32]$frames[$i].Length); $writer.Write([uint32]$offset)
    $offset += $frames[$i].Length
}
foreach ($frame in $frames) { $writer.Write($frame) }
$icon = Join-Path $Assets 'app.ico'
[IO.File]::WriteAllBytes($icon, $out.ToArray())
"Wrote $icon ($($out.Length) bytes, sizes $($sizes -join ', '))"
$source.Dispose()
