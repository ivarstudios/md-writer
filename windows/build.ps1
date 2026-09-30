<#
.SYNOPSIS
  Builds md-writer for Windows.

.DESCRIPTION
  Default: Release MSIX packages for x64 and ARM64, bundled into
  dist\md-writer_<version>.msixbundle, ready to upload to Partner Center
  (the Store signs it). Before the first Store build, set the Identity Name
  and Publisher in MdWriter\Package.appxmanifest to the values Partner
  Center gives you.

  -Dev: Debug build for this machine, registered in place so it shows up in
  Start and in "Open with" (needs Developer Mode: Settings > System > For
  developers).

.EXAMPLE
  .\build.ps1
.EXAMPLE
  .\build.ps1 -Dev
#>
param(
    [switch]$Dev,
    [string[]]$Platforms = @('x64', 'arm64')
)
$ErrorActionPreference = 'Stop'
$project = Join-Path $PSScriptRoot 'MdWriter\MdWriter.csproj'
$dist = Join-Path $PSScriptRoot 'dist'

function Invoke-Checked([scriptblock]$command) {
    & $command
    if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE" }
}

if ($Dev) {
    $name = ([xml](Get-Content (Join-Path $PSScriptRoot 'MdWriter\Package.appxmanifest'))).Package.Identity.Name
    $buildRoot = Join-Path $PSScriptRoot 'MdWriter\bin\devbuild\'
    Invoke-Checked { dotnet build $project -c Debug -p:Platform=x64 "-p:BaseOutputPath=$buildRoot" }
    $built = Get-ChildItem $buildRoot -Recurse -Filter AppxManifest.xml |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1

    # Register a copy under its own revision number, so Start and the taskbar never show
    # logos cached from an earlier build, and the shell never locks the build output
    # (it keeps a registered layout's resources.pri mapped). Settings are kept.
    Get-Process MdWriter -ErrorAction SilentlyContinue | Stop-Process -Force
    Get-AppxPackage -Name $name | Remove-AppxPackage -PreserveApplicationData
    $devRoot = Join-Path $PSScriptRoot 'MdWriter\bin\dev'
    $stamp = Get-Date -Format 'yyMMdd-HHmmss'
    $layout = Join-Path $devRoot $stamp
    New-Item -ItemType Directory -Force $devRoot | Out-Null
    Copy-Item $built.DirectoryName $layout -Recurse
    $manifest = Join-Path $layout 'AppxManifest.xml'
    [xml] $doc = Get-Content $manifest
    $version = [version]$doc.Package.Identity.Version
    $revision = [int](((Get-Date) - [datetime]'2026-01-01').TotalMinutes % 65535)
    $doc.Package.Identity.Version = "$($version.Major).$($version.Minor).$($version.Build).$revision"
    $doc.Save($manifest)
    Add-AppxPackage -Register $manifest -ForceApplicationShutdown
    Get-ChildItem $devRoot -Directory | Where-Object Name -ne $stamp | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Registered $($doc.Package.Identity.Version). Start md-writer from Start, or run: md-writer <file>"
    return
}

$version = ([xml](Get-Content (Join-Path $PSScriptRoot 'MdWriter\Package.appxmanifest'))).Package.Identity.Version
$staging = Join-Path $dist 'msix'
Remove-Item $dist -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $staging | Out-Null

foreach ($platform in $Platforms) {
    $out = Join-Path $dist "build-$platform\"
    Invoke-Checked {
        dotnet publish $project -c Release -p:Platform=$platform -r "win-$platform" `
            -p:GenerateAppxPackageOnBuild=true -p:AppxPackageSigningEnabled=false `
            -p:AppxBundle=Never -p:AppxPackageDir=$out
    }
    # Just the app: the Windows App Runtime packages beside it are framework packages the Store supplies.
    Get-ChildItem $out -Recurse -Filter 'MdWriter_*.msix' | Copy-Item -Destination $staging -Force
}

$makeappx = Get-ChildItem "$env:USERPROFILE\.nuget\packages\microsoft.windows.sdk.buildtools" -Recurse -Filter makeappx.exe |
    Where-Object { $_.Directory.Name -eq 'x64' } | Sort-Object FullName -Descending | Select-Object -First 1
if (-not $makeappx) { throw 'makeappx.exe not found; run a build first so NuGet restores Microsoft.Windows.SDK.BuildTools.' }

$bundle = Join-Path $dist "md-writer_$version.msixbundle"
Invoke-Checked { & $makeappx.FullName bundle /d $staging /p $bundle /bv $version /o }
Write-Host "`nStore upload: $bundle"
