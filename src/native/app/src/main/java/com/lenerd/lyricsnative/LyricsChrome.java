package com.lenerd.lyricsnative;

import android.content.Context;
import android.content.ContextWrapper;
import android.app.Activity;
import android.graphics.*;
import android.text.TextUtils;
import android.view.View;
import android.view.WindowInsets;
import android.view.Window;
import android.view.WindowManager;
import android.view.MotionEvent;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.SeekBar;
import com.lenerd.spotifyplus.sdk.SpotifyPlusComponent;
import com.lenerd.spotifyplus.sdk.spotify.SpotifyPlusContext;
import org.json.JSONArray;
import org.json.JSONObject;

/** Small native primitives for lyrics chrome; all player actions stay in React. */
public final class LyricsChrome {
    public static final class Sheet extends SpotifyPlusComponent<SheetView> {
        public String getName() { return "LyricsSheetRoot"; }
        public SheetView createView(Context context, SpotifyPlusContext spotify) { return new SheetView(context); }
        public void updateProps(SheetView view, JSONObject old, JSONObject props) {
            view.headerHeight = (float) props.optDouble("headerHeight", 160) * view.getResources().getDisplayMetrics().density;
        }
    }
    public static final class SheetView extends FrameLayout {
        OnTouchListener gestureListener;
        float headerHeight, downY;
        boolean headerTouch, dragging;
        SheetView(Context context) { super(context); }
        @Override public void setOnTouchListener(OnTouchListener listener) {
            gestureListener = listener;
            // Dispatch header gestures from this stationary frame, independently
            // of the moving header's child touch targets.
        }
        @Override public boolean dispatchTouchEvent(MotionEvent event) {
            int action = event.getActionMasked();
            if (action == MotionEvent.ACTION_DOWN) {
                if (getParent() != null) getParent().requestDisallowInterceptTouchEvent(true);
                headerTouch = event.getY() < headerHeight && gestureListener != null;
                dragging = false;
                downY = event.getRawY();
            }
            boolean handled;
            if (headerTouch) {
                if (action == MotionEvent.ACTION_MOVE && !dragging && Math.abs(event.getRawY() - downY) > 10) {
                    dragging = true;
                    MotionEvent cancel = MotionEvent.obtain(event);
                    cancel.setAction(MotionEvent.ACTION_CANCEL);
                    super.dispatchTouchEvent(cancel);
                    cancel.recycle();
                }
                gestureListener.onTouch(this, event);
                handled = dragging || super.dispatchTouchEvent(event);
            } else handled = super.dispatchTouchEvent(event);
            if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) {
                headerTouch = dragging = false;
                if (getParent() != null) getParent().requestDisallowInterceptTouchEvent(false);
            }
            return handled;
        }
    }
    /** Window appearance is scoped to the mounted sheet; gestures remain in TypeScript. */
    public static final class SheetWindow extends SpotifyPlusComponent<SheetWindowView> {
        public String getName() { return "LyricsWindow"; }
        public SheetWindowView createView(Context context, SpotifyPlusContext spotify) { return new SheetWindowView(context); }
    }
    @SuppressWarnings("deprecation")
    public static final class SheetWindowView extends View {
        Window window;
        int statusColor, uiFlags, windowFlags;
        boolean contrast;
        SheetWindowView(Context context) { super(context); setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO); }
        protected void onAttachedToWindow() {
            super.onAttachedToWindow();
            Context context = getContext();
            while (context instanceof ContextWrapper && !(context instanceof Activity)) context = ((ContextWrapper) context).getBaseContext();
            if (!(context instanceof Activity) || window != null) return;
            window = ((Activity) context).getWindow();
            statusColor = window.getStatusBarColor();
            uiFlags = window.getDecorView().getSystemUiVisibility();
            windowFlags = window.getAttributes().flags;
            contrast = window.isStatusBarContrastEnforced();
            window.setDecorFitsSystemWindows(false);
            window.getDecorView().setSystemUiVisibility(uiFlags | SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | SYSTEM_UI_FLAG_LAYOUT_STABLE);
            window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.setStatusBarColor(Color.TRANSPARENT);
            window.setStatusBarContrastEnforced(false);
            window.getDecorView().requestApplyInsets();
        }
        protected void onDetachedFromWindow() {
            if (window != null) {
                window.setDecorFitsSystemWindows((uiFlags & SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN) == 0);
                window.getDecorView().setSystemUiVisibility(uiFlags);
                window.setFlags(windowFlags, WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS
                        | WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
                window.setStatusBarColor(statusColor);
                window.setStatusBarContrastEnforced(contrast);
                window.getDecorView().requestApplyInsets();
                window = null;
            }
            super.onDetachedFromWindow();
        }
    }
    public static final class Seek extends SpotifyPlusComponent<UserSeekBar> {
        public String getName() { return "LyricsSeekBar"; }
        public UserSeekBar createView(Context context, SpotifyPlusContext spotify) { return new UserSeekBar(context); }
    }
    public static final class UserSeekBar extends SeekBar {
        UserSeekBar(Context context) { super(context); }
        @Override public void setOnSeekBarChangeListener(OnSeekBarChangeListener listener) {
            // Animated progress is applied while the UI worklet lock is held.
            // Sending a JS event from that path re-enters the bridge and deadlocks.
            // Only finger/accessibility changes need to cross to JavaScript.
            super.setOnSeekBarChangeListener(listener == null ? null : new OnSeekBarChangeListener() {
                public void onProgressChanged(SeekBar bar, int progress, boolean fromUser) {
                    if (fromUser) listener.onProgressChanged(bar, progress, true);
                }
                public void onStartTrackingTouch(SeekBar bar) { listener.onStartTrackingTouch(bar); }
                public void onStopTrackingTouch(SeekBar bar) { listener.onStopTrackingTouch(bar); }
            });
        }
    }
    public static final class Icon extends SpotifyPlusComponent<IconView> {
        public String getName() { return "LyricsIcon"; }
        public IconView createView(Context context, SpotifyPlusContext spotify) { return new IconView(context); }
        public void updateProps(IconView view, JSONObject old, JSONObject props) {
            view.name = props.optString("name", "play");
            view.filled = props.optBoolean("filled", false);
            view.invalidate();
        }
    }
    public static final class Title extends SpotifyPlusComponent<MarqueeTitleView> {
        public String getName() { return "LyricsTitle"; }
        public MarqueeTitleView createView(Context context, SpotifyPlusContext spotify) { return new MarqueeTitleView(context); }
        public void updateProps(MarqueeTitleView view, JSONObject old, JSONObject props) {
            String text = props.optString("text", "");
            if (!TextUtils.equals(text, view.getText())) view.setText(text);
        }
    }
    /** Draw-only marquee: unrelated layout passes never restart the scroll clock. */
    public static final class MarqueeTitleView extends TextView {
        long startedAt;
        String marqueeText;
        float lastTextWidth = -1;
        MarqueeTitleView(Context context) {
            super(context); setSingleLine(true); setIncludeFontPadding(false);
        }
        protected void onTextChanged(CharSequence text, int start, int before, int count) {
            super.onTextChanged(text, start, before, count);
            String next = text.toString();
            if (!TextUtils.equals(next, marqueeText)) {
                marqueeText = next;
                startedAt = android.os.SystemClock.uptimeMillis(); lastTextWidth = -1;
            }
        }
        protected void onSizeChanged(int w, int h, int oldW, int oldH) {
            super.onSizeChanged(w, h, oldW, oldH);
            if (w != oldW) startedAt = android.os.SystemClock.uptimeMillis();
        }
        protected void onDraw(Canvas canvas) {
            String text = getText().toString();
            Paint paint = getPaint(); paint.setColor(getCurrentTextColor());
            float width = getWidth() - getPaddingLeft() - getPaddingRight();
            float textWidth = paint.measureText(text);
            if (textWidth != lastTextWidth) {
                lastTextWidth = textWidth; startedAt = android.os.SystemClock.uptimeMillis();
            }
            float offset = 0;
            float gap = 36 * getResources().getDisplayMetrics().density;
            if (textWidth > width && width > 0) {
                double elapsed = android.os.SystemClock.uptimeMillis() - startedAt;
                offset = (float) MarqueeTiming.offset(elapsed, textWidth + gap,
                        30 * getResources().getDisplayMetrics().density, 1500);
                postInvalidateDelayed(16);
            }
            Paint.FontMetrics font = paint.getFontMetrics();
            float baseline = (getHeight() - font.ascent - font.descent) / 2;
            int save = canvas.save();
            canvas.clipRect(getPaddingLeft(), 0, getWidth() - getPaddingRight(), getHeight());
            canvas.drawText(text, getPaddingLeft() - offset, baseline, paint);
            if (textWidth > width) canvas.drawText(text, getPaddingLeft() + textWidth + gap - offset, baseline, paint);
            canvas.restoreToCount(save);
        }
    }
    public static final class Inset extends SpotifyPlusComponent<InsetView> {
        public String getName() { return "LyricsInset"; }
        public InsetView createView(Context context, SpotifyPlusContext spotify) { return new InsetView(context); }
        public void updateProps(InsetView view, JSONObject old, JSONObject props) {
            view.bottom = "bottom".equals(props.optString("edge", "top")); view.requestLayout();
        }
    }
    public static final class Viewport extends SpotifyPlusComponent<ViewportView> {
        public String getName() { return "LyricsViewport"; }
        public ViewportView createView(Context context, SpotifyPlusContext spotify) { return new ViewportView(context); }
        public void updateProps(ViewportView view, JSONObject old, JSONObject props) {
            JSONArray mask = props.optJSONArray("controlsMask");
            if (mask != null) {
                view.coverOpacity = (float) Math.max(0, Math.min(1, mask.optDouble(0)));
                float height = (float) mask.optDouble(1) * view.getResources().getDisplayMetrics().density;
                if (height != view.coverHeight) { view.coverHeight = height; view.shader = null; }
                view.invalidate();
            }
        }
    }
    public static final class InsetView extends View {
        boolean bottom;
        private final int[] location = new int[2];
        InsetView(Context context) { super(context); setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO); }
        protected void onAttachedToWindow() {
            super.onAttachedToWindow(); requestApplyInsets(); post(this::requestLayout);
        }
        public WindowInsets onApplyWindowInsets(WindowInsets insets) { requestLayout(); return insets; }
        protected void onMeasure(int width, int height) {
            WindowInsets insets = getRootWindowInsets();
            int padding;
            if (insets != null) {
                android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                getLocationOnScreen(location);
                // Insets belong to the resting layout, even while the sheet is
                // entering or following a header drag through translateY.
                float layoutY = location[1];
                for (View ancestor = this; ancestor != null;) {
                    layoutY -= ancestor.getTranslationY();
                    ancestor = ancestor.getParent() instanceof View ? (View) ancestor.getParent() : null;
                }
                padding = bottom ? safe.bottom : Math.max(0, Math.round(safe.top - layoutY));
            } else {
                int id = getResources().getIdentifier(bottom ? "navigation_bar_height" : "status_bar_height", "dimen", "android");
                padding = id == 0 ? Math.round((bottom ? 24 : 28) * getResources().getDisplayMetrics().density) : getResources().getDimensionPixelSize(id);
            }
            setMeasuredDimension(View.MeasureSpec.getSize(width), padding);
        }
    }
    public static final class ViewportView extends FrameLayout {
        final Paint mask = new Paint(Paint.ANTI_ALIAS_FLAG);
        float coverOpacity, coverHeight;
        Shader shader;
        ViewportView(Context context) {
            super(context); setClipChildren(true); setClipToPadding(true);
            mask.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.DST_OUT));
        }
        protected void onSizeChanged(int w, int h, int oldW, int oldH) { super.onSizeChanged(w, h, oldW, oldH); shader = null; }
        protected void dispatchDraw(Canvas canvas) {
            if (coverOpacity <= 0 || coverHeight <= 0) { super.dispatchDraw(canvas); return; }
            int layer = canvas.saveLayer(0, 0, getWidth(), getHeight(), null);
            super.dispatchDraw(canvas);
            float top = getHeight() - coverHeight;
            float fade = 24 * getResources().getDisplayMetrics().density;
            if (shader == null) shader = new LinearGradient(0, top - fade, 0, top,
                Color.TRANSPARENT, Color.BLACK, Shader.TileMode.CLAMP);
            mask.setShader(shader); mask.setAlpha(Math.round(255 * coverOpacity));
            canvas.drawRect(0, Math.max(0, top - fade), getWidth(), getHeight(), mask);
            canvas.restoreToCount(layer);
        }
    }
    public static final class IconView extends View {
        String name = "play";
        boolean filled;
        final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        final Path path = new Path();
        IconView(Context context) { super(context); setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO); }
        protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            int saved = canvas.save();
            float size = Math.min(getWidth(), getHeight());
            canvas.translate((getWidth() - size) / 2, (getHeight() - size) / 2);
            canvas.scale(size / 24, size / 24);
            paint.setColor(Color.WHITE); paint.setStrokeWidth(1.7f);
            paint.setStrokeJoin(Paint.Join.ROUND); paint.setStrokeCap(Paint.Cap.ROUND);
            paint.setStyle(Paint.Style.FILL); path.reset();
            if ("heart".equals(name)) {
                path.moveTo(12, 20); path.cubicTo(8, 17, 3, 13, 3, 8);
                path.cubicTo(3, 3, 9, 2, 12, 6); path.cubicTo(15, 2, 21, 3, 21, 8);
                path.cubicTo(21, 13, 16, 17, 12, 20); path.close();
                paint.setStyle(filled ? Paint.Style.FILL : Paint.Style.STROKE); canvas.drawPath(path, paint);
            } else if ("more".equals(name)) {
                for (int x = 6; x <= 18; x += 6) canvas.drawCircle(x, 12, 1.35f, paint);
            } else if ("pause".equals(name)) {
                canvas.drawRoundRect(6, 4, 10, 20, 1, 1, paint); canvas.drawRoundRect(14, 4, 18, 20, 1, 1, paint);
            } else if ("previous".equals(name) || "next".equals(name)) {
                if ("previous".equals(name)) { canvas.translate(24, 0); canvas.scale(-1, 1); }
                path.moveTo(3, 6); path.lineTo(12, 12); path.lineTo(3, 18); path.close();
                path.moveTo(12, 6); path.lineTo(21, 12); path.lineTo(12, 18); path.close(); canvas.drawPath(path, paint);
            } else {
                path.moveTo(7, 3); path.lineTo(21, 12); path.lineTo(7, 21); path.close(); canvas.drawPath(path, paint);
            }
            canvas.restoreToCount(saved);
        }
    }
}
