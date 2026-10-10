package com.lenerd.lyricsnative;

import com.lenerd.spotifyplus.sdk.SpotifyPlusPlugin;
import com.lenerd.spotifyplus.sdk.SpotifyPlusRegistry;
import com.lenerd.spotifyplus.sdk.spotify.SpotifyPlusContext;

public class NativePlugin implements SpotifyPlusPlugin {
    @Override
    public void register(SpotifyPlusRegistry registry, SpotifyPlusContext context) {
        registry.registerComponent(new GradientText());
        registry.registerComponent(new AnimatedBackground());
        registry.registerComponent(new LyricCanvas());
        registry.registerComponent(new LyricRow());
        registry.registerComponent(new LyricMotion());
        registry.registerComponent(new LyricsChrome.Icon());
        registry.registerComponent(new LyricsChrome.Title());
        registry.registerComponent(new LyricsChrome.Inset());
        registry.registerComponent(new LyricsChrome.Viewport());
        registry.registerComponent(new LyricsChrome.Seek());
        registry.registerComponent(new LyricsChrome.SheetWindow());
        registry.registerComponent(new LyricsChrome.Sheet());
    }
}
