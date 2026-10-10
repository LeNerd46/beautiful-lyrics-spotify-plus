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
            view.updateGeometry(geometry.optDouble(0, 0), geometry.optDouble(2, 0),
                geometry.optDouble(3, 0), geometry.optBoolean(4, true));
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
    final LyricSpring motion = new LyricSpring();
    final LyricSpring layoutMotion = new LyricSpring();
    final float density;
    LyricCanvasView canvas;
    int index;
    double top, displayedTop, estimatedHeight, correction, layoutStartedAt = -1;
    boolean geometryInitialized, layoutAnimating;
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

    void updateGeometry(double nextTop, double startedAt, double delay, boolean snap) {
        double now = System.nanoTime() / 1000000.0;
        boolean newTransition = startedAt > 0 && startedAt != layoutStartedAt;
        boolean changed = Math.abs(nextTop - top) > 0.001;
        if (!geometryInitialized || snap) {
            layoutMotion.snap(nextTop, now);
            displayedTop = nextTop;
            layoutAnimating = false;
        } else if (changed) {
            if (newTransition || !layoutMotion.arrived(now)) {
                layoutMotion.retarget(nextTop, newTransition ? startedAt : now, newTransition ? delay : 0, 90, 15);
                displayedTop = layoutMotion.at(now);
                layoutAnimating = true;
            } else {
                layoutMotion.snap(nextTop, now);
                displayedTop = nextTop;
                layoutAnimating = false;
            }
        }
        geometryInitialized = true;
        layoutStartedAt = startedAt;
        top = nextTop;
    }

    void begin(double oldFollow, double target, double timestamp, double stiffness, double damping,
            double delay, boolean snap, double browse, double viewportHeight) {
        double current = oldFollow - correction;
        double height = Math.max(estimatedHeight, getHeight() / density);
        boolean visible = top - current - browse < viewportHeight && top + height - current - browse > 0;
        boolean incoming = top - target - browse < viewportHeight && top + height - target - browse > 0;
        if (snap || !(visible || incoming) || (delay == 0 && !delayed)) {
            delayed = false; correction = 0;
        } else {
            if (!delayed) motion.copyFrom(canvas.motion);
            else if (canvas.paused) motion.snap(current, timestamp);
            delayed = true;
            motion.retarget(target, timestamp, delay, stiffness, damping);
        }
        applyPosition();
    }

    void animate(double follow, double timestamp) {
        if (!delayed && !layoutAnimating) return;
        if (layoutAnimating) {
            displayedTop = layoutMotion.at(timestamp);
            if (layoutMotion.arrived(timestamp)) {
                layoutMotion.snap(top, timestamp);
                displayedTop = top;
                layoutAnimating = false;
            }
        }
        if (delayed && !canvas.paused) {
            correction = follow - motion.at(timestamp);
            if (motion.arrived(timestamp) && canvas.motion.arrived(timestamp)) { delayed = false; correction = 0; }
        }
        applyPosition();
    }

    void resume(double follow, double target, double timestamp) {
        if (delayed) {
            motion.snap(follow - correction, timestamp);
            motion.retarget(target, timestamp, 0, canvas.motion.stiffness, canvas.motion.damping);
        }
    }

    void applyPosition() { setTranslationY((float) ((displayedTop + correction) * density)); }
}
