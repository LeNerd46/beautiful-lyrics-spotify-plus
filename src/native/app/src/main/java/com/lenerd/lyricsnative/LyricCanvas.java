package com.lenerd.lyricsnative;

import android.app.Activity;
import android.content.Context;
import android.content.ContextWrapper;
import android.os.Trace;
import android.view.Choreographer;
import android.view.Display;
import android.view.Window;
import android.view.WindowManager;
import android.widget.FrameLayout;
import com.lenerd.spotifyplus.sdk.SpotifyPlusComponent;
import com.lenerd.spotifyplus.sdk.spotify.SpotifyPlusContext;
import com.lenerd.spotifyplus.sdk.spotify.SpotifyPlusPlayer;
import org.json.JSONObject;
import java.util.ArrayList;

public class LyricCanvas extends SpotifyPlusComponent<LyricCanvasView> {
    public String getName() { return "LyricCanvas"; }
    public LyricCanvasView createView(Context context, SpotifyPlusContext spotify) {
        return new LyricCanvasView(context, spotify.getPlayer());
    }
    public void updateProps(LyricCanvasView view, JSONObject oldProps, JSONObject props) {
        view.control(props.optJSONObject("motionControl"));
    }
}

class LyricCanvasView extends FrameLayout implements Choreographer.FrameCallback {
    final ArrayList<LyricRowView> rows = new ArrayList<>();
    final LyricTween motion = new LyricTween();
    final SpotifyPlusPlayer player;
    final float density;
    long commandVersion = -1;
    double follow, browse, lastPosition = -1;
    boolean paused, effectsPaused, attached;
    Window window;
    int previousMode, requestedMode;
    float previousRate;

    LyricCanvasView(Context context, SpotifyPlusPlayer player) {
        super(context);
        this.player = player;
        density = getResources().getDisplayMetrics().density;
        setClipChildren(false); setClipToPadding(false);
    }

    void control(JSONObject control) {
        if (control == null) return;
        browse = control.optDouble("browseOffset", browse);
        boolean nextPaused = control.optBoolean("pauseFollow", false) || control.optBoolean("suspended", false);
        effectsPaused = control.optBoolean("pauseEffects", false);
        JSONObject command = control.optJSONObject("command");
        double now = System.nanoTime() / 1000000.0;
        if (command != null && command.optLong("version") != commandVersion) {
            commandVersion = command.optLong("version");
            double timestamp = command.optDouble("startedAt", now);
            double target = command.optDouble("offset", follow);
            double duration = command.optDouble("duration", 430);
            boolean snap = command.optBoolean("snap", false);
            if (!paused) follow = motion.at(timestamp);
            for (LyricRowView row : rows) row.begin(follow, target, timestamp, duration,
                    command.optInt("firstVisibleIndex"), command.optBoolean("stagger"), snap, browse, viewportHeight());
            motion.set(follow, target, timestamp, snap ? 0 : duration);
            if (snap) follow = target;
        } else if (paused && !nextPaused && !control.optBoolean("suspended", false)) {
            motion.set(follow, motion.to, now, motion.duration);
            for (LyricRowView row : rows) row.resume(follow, motion.to, now, motion.duration);
        }
        paused = nextPaused;
        setTranslationY((float) (-(follow + browse) * density));
    }

    private double viewportHeight() {
        return getParent() instanceof android.view.View ? ((android.view.View) getParent()).getHeight() / density : 0;
    }

    protected void onAttachedToWindow() {
        super.onAttachedToWindow(); attached = true;
        requestRefreshRate();
        Choreographer.getInstance().postFrameCallback(this);
    }

    protected void onDetachedFromWindow() {
        attached = false;
        Choreographer.getInstance().removeFrameCallback(this);
        if (window != null && window.getAttributes().preferredDisplayModeId == requestedMode) {
            WindowManager.LayoutParams attrs = window.getAttributes();
            attrs.preferredDisplayModeId = previousMode; attrs.preferredRefreshRate = previousRate;
            window.setAttributes(attrs);
        }
        window = null;
        super.onDetachedFromWindow();
    }

    private void requestRefreshRate() {
        Context context = getRootView().getContext();
        while (context instanceof ContextWrapper && !(context instanceof Activity)) {
            Context next = ((ContextWrapper) context).getBaseContext();
            if (next == context) break;
            context = next;
        }
        Display display = getDisplay();
        if (!(context instanceof Activity) || display == null) return;
        Display.Mode current = display.getMode(), best = current;
        for (Display.Mode mode : display.getSupportedModes()) {
            if (mode.getPhysicalWidth() == current.getPhysicalWidth() && mode.getPhysicalHeight() == current.getPhysicalHeight()
                    && mode.getRefreshRate() > best.getRefreshRate()) best = mode;
        }
        window = ((Activity) context).getWindow();
        WindowManager.LayoutParams attrs = window.getAttributes();
        previousMode = attrs.preferredDisplayModeId; previousRate = attrs.preferredRefreshRate;
        requestedMode = best.getModeId();
        attrs.preferredDisplayModeId = requestedMode; attrs.preferredRefreshRate = best.getRefreshRate();
        window.setAttributes(attrs);
    }

    public void doFrame(long frameTimeNanos) {
        if (!attached) return;
        Trace.beginSection("LyricsNativeFrame");
        double timestamp = frameTimeNanos / 1000000.0;
        if (!paused) follow = motion.at(timestamp);
        setTranslationY((float) (-(follow + browse) * density));
        double position = effectsPaused ? lastPosition : player.getPlaybackPosition();
        if (position >= 0) lastPosition = position;
        double height = viewportHeight();
        for (int index = 0; index < rows.size(); index++) {
            LyricRowView row = rows.get(index);
            if (!paused) row.animate(follow, timestamp);
            if (row.estimatedHeight <= 0) continue;
            double y = row.top + row.correction - follow - browse;
            if (effectsPaused || y > height + 32 || y + Math.max(row.estimatedHeight, row.getHeight() / density) < -32) continue;
            for (int glyph = 0; glyph < row.targets.size(); glyph++) row.targets.get(glyph).animateMotion(lastPosition);
        }
        Trace.endSection();
        Choreographer.getInstance().postFrameCallback(this);
    }
}
