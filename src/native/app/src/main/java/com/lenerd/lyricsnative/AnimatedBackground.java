package com.lenerd.lyricsnative;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Log;
import com.lenerd.spotifyplus.sdk.SpotifyPlusComponent;
import com.lenerd.spotifyplus.sdk.spotify.SpotifyPlusContext;
import org.json.JSONObject;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.lang.ref.WeakReference;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class AnimatedBackground extends SpotifyPlusComponent<AnimatedBackgroundView> {
    private static final ExecutorService executor = Executors.newFixedThreadPool(2);
    public String getName() { return "AnimatedBackground"; }
    public AnimatedBackgroundView createView(Context context, SpotifyPlusContext spotify) {
        return new AnimatedBackgroundView(context);
    }
    public void updateProps(AnimatedBackgroundView view, JSONObject old, JSONObject props) {
        String url = props.optString("imageUrl", "");
        if (url.equals(view.artworkUrl)) return;
        view.artworkUrl = url;
        int request = ++view.artworkRequest;
        if (!url.isEmpty()) loadImageAsync(new WeakReference<>(view), url, request);
    }
    private void loadImageAsync(WeakReference<AnimatedBackgroundView> reference, String url, int request) {
        executor.execute(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setConnectTimeout(10000);
                connection.setReadTimeout(10000);
                Bitmap bitmap;
                try (InputStream input = connection.getInputStream()) {
                    bitmap = BitmapFactory.decodeStream(input);
                }
                if (bitmap == null) return;
                AnimatedBackgroundView target = reference.get();
                if (target == null) { bitmap.recycle(); return; }
                target.post(() -> {
                    AnimatedBackgroundView view = reference.get();
                    // A slow previous cover must not replace the current song.
                    if (view != null && view.artworkRequest == request) view.updateImage(bitmap);
                    bitmap.recycle();
                });
            } catch (Exception e) {
                Log.e("BeautifulLyrics", "Could not download album artwork", e);
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }
}
