package com.lenerd.lyricsnative;

import android.content.Context;
import android.graphics.Color;
import android.os.Build;
import android.view.View;
import android.widget.FrameLayout;
import com.lenerd.spotifyplus.sdk.SpotifyPlusComponent;
import com.lenerd.spotifyplus.sdk.spotify.SpotifyPlusContext;
import org.json.JSONArray;
import org.json.JSONObject;

public class LyricMotion extends SpotifyPlusComponent<LyricMotionView> {
    public String getName() { return "LyricMotion"; }
    public LyricMotionView createView(Context context, SpotifyPlusContext spotify) { return new LyricMotionView(context); }
    public void updateProps(LyricMotionView view, JSONObject oldProps, JSONObject props) {
        view.track.configure(props.optJSONObject("motionTrack"));
        view.glow = props.optBoolean("glowElevation", false);
        JSONArray range = props.optJSONArray("opacityRange");
        if (range != null) { view.opacityStart = range.optDouble(0); view.opacityEnd = range.optDouble(1); }
    }
}

class LyricMotionView extends FrameLayout implements MotionTarget {
    final MotionTrack track = new MotionTrack();
    final float density;
    LyricCanvasView canvas;
    boolean glow;
    double opacityStart = Double.NaN, opacityEnd;
    LyricMotionView(Context context) {
        super(context);
        density = getResources().getDisplayMetrics().density;
        setClipChildren(false); setClipToPadding(false);
        if (Build.VERSION.SDK_INT >= 28) {
            setOutlineAmbientShadowColor(Color.WHITE); setOutlineSpotShadowColor(Color.WHITE);
        }
    }
    public View motionView() { return this; }
    protected void onAttachedToWindow() { super.onAttachedToWindow(); canvas = MotionTarget.register(this); }
    protected void onDetachedFromWindow() {
        MotionTarget.unregister(this, canvas); canvas = null; super.onDetachedFromWindow();
    }
    public void animateMotion(double positionMs) {
        if (!Double.isNaN(opacityStart)) setAlpha(positionMs < opacityStart ? 1f / 3 : positionMs >= opacityEnd ? 0.6f : 1);
        if (!track.sample(positionMs)) return;
        float[] v = track.value;
        setTranslationY(v[3] * density); setScaleX(v[4]); setScaleY(v[4]); setAlpha(v[5]);
        if (glow) setElevation(Math.max(0, v[2]) * 10 * density);
    }
}
