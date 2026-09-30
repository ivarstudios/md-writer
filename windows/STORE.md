# Publishing to the Microsoft Store

## Identity

`md-writer` is reserved in Partner Center under IVAR Studios, and
`MdWriter/Package.appxmanifest` already carries its identity
(`IVARStudios.md-writer`, publisher `CN=341D2112-5BF3-4CF3-A24F-B3527F111E31`).
Don't change these, or the Store rejects the upload.

## Each release

1. Bump `Version` in `Package.appxmanifest`. Keep the last part `0`, e.g.
   `1.0.1.0`. The Store rejects anything else.
2. Run `.\build.ps1` and upload `dist\md-writer_<version>.msixbundle` under
   *Packages*. It's unsigned, and the Store signs it.
3. Submit.

## Listing, images and trailer

[store/listing.md](store/listing.md) has the text for every Partner Center
field and says which file goes into which slot:

| What | Where |
|---|---|
| Screenshots, 2560 × 1440 | `store/1-…png` to `store/4-…png` |
| Poster, box art, tile icons, Super hero art | `store/art/` |
| Trailer and its thumbnail | `store/md-writer-trailer.mp4`, `store/md-writer-trailer-thumbnail.png` |

The art and the trailer are generated, so they stay in step with the app. You
need Microsoft Edge and ffmpeg (`winget install Gyan.FFmpeg`):

```powershell
cd store\trailer
npm install
node art.js                # store/art/*.png
node record.js --preview   # a frame every half second in out/preview, for checking
node record.js             # the trailer and its thumbnail, about 10 minutes
```

The trailer drives the real `index.html` in a mocked Windows host. Its script,
meaning the text typed, the callouts and the timing, is in `store/trailer/stage.js`.
