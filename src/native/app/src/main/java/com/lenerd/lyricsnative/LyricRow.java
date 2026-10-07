package com.lenerd.lyricsnative;

import android.content.Context;
import android.view.ViewParent;
import android.widget.FrameLayout;
import com.lenerd.spotifyplus.sdk.SpotifyPlusComponent;
import com.lenerd.spotifyplus.sdk.spotify.SpotifyPlusContext;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;

public class LyricRow extends SpotifyPlusComponent<LyricRowView> {
    public String getName() { return "LyricRow"; }
    public LyricRowView createView(Context context, SpotifyPlusContext spotify) { return new LyricRowView(context); }
    public void updateProps(LyricRowView view, JSONObject oldProps, JSONObject props) {
        view.index = props.optInt("rowIndex", view.index);
        JSONArray geometry = props.optJSONArray("rowGeometry");
        if (geometry != null) {
            view.top = geometry.optDouble(0, 0);
            view.estimatedHeight = geometry.optDouble(1, 96);
            // Invisible absolute rows retain their measurable natural height,
            // but cannot cover another lyric or intercept its touches.
            view.setVisibility(view.estimatedHeight > 0 ? android.view.View.VISIBLE : android.view.View.INVISIBLE);
            view.applyPosition();
        }
    }
}

class LyricRowView extends FrameLayout {
    final ArrayList<MotionTarget> targets = new ArrayList<>();
    final LyricTween motion = new LyricTween();
    final float density;
    LyricCanvasView canvas;
    int index;
    double top, estimatedHeight, correction;
    boolean delayed;

    LyricRowView(Context context) {
        super(context);
        density = getResources().getDisplayMetrics().density;
        setClipChildren(false); setClipToPadding(false);
    }

    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        for (ViewParent parent = getParent(); parent != null; parent = parent.getParent()) {
            if (parent instanceof LyricCanvasView) {
                canvas = (LyricCanvasView) parent;
                canvas.rows.add(this);
                break;
            }
        }
        applyPosition();
    }

    protected void onDetachedFromWindow() {
        if (canvas != null) canvas.rows.remove(this);
        canvas = null; targets.clear();
        super.onDetachedFromWindow();
    }

    void begin(double oldFollow, double target, double timestamp, double duration,
            int anchor, boolean stagger, boolean snap, double browse, double viewportHeight) {
        double current = oldFollow - correction;
        double height = Math.max(estimatedHeight, getHeight() / density);
        boolean visible = top - current - browse < viewportHeight && top + height - current - browse > 0;
        boolean incoming = top - target - browse < viewportHeight && top + height - target - browse > 0;
        double delay = stagger ? LyricTween.delay(index, anchor) : 0;
        if (snap || !(visible || incoming) || (delay == 0 && !delayed)) {
            delayed = false; correction = 0;
        } else {
            delayed = true;
            motion.set(current, target, timestamp + delay, duration);
        }
        applyPosition();
    }

    void animate(double follow, double timestamp) {
        if (!delayed) return;
        correction = follow - motion.at(timestamp);
        if (timestamp >= motion.start + motion.duration) { delayed = false; correction = 0; }
        applyPosition();
    }

    void resume(double follow, double target, double timestamp, double duration) {
        if (delayed) motion.set(follow - correction, target, timestamp, duration);
    }

    void applyPosition() { setTranslationY((float) ((top + correction) * density)); }
}
