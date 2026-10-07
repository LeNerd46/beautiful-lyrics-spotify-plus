package com.lenerd.lyricsnative;

import android.view.View;
import android.view.ViewParent;

interface MotionTarget {
    View motionView();
    void animateMotion(double positionMs);

    static LyricCanvasView register(MotionTarget target) {
        LyricRowView row = null;
        for (ViewParent parent = target.motionView().getParent(); parent != null; parent = parent.getParent()) {
            if (parent instanceof LyricRowView) row = (LyricRowView) parent;
            if (parent instanceof LyricCanvasView) {
                if (row != null) row.targets.add(target);
                return (LyricCanvasView) parent;
            }
        }
        return null;
    }

    static void unregister(MotionTarget target, LyricCanvasView canvas) {
        if (canvas == null) return;
        for (LyricRowView row : canvas.rows) row.targets.remove(target);
    }
}
