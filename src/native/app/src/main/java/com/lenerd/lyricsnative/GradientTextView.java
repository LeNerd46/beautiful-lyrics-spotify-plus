package com.lenerd.lyricsnative;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.util.AttributeSet;
import android.widget.TextView;
import android.view.View;
import android.text.TextUtils;

import java.util.Arrays;

@SuppressLint("AppCompatCustomView")
public class GradientTextView extends TextView implements MotionTarget {
    final MotionTrack motionTrack = new MotionTrack();
    private LyricCanvasView motionCanvas;
    private final Matrix gradientMatrix = new Matrix();
    private LinearGradient activeShader, idleShader, sungShader;
    private float shaderWidth;
    private boolean colorsDirty = true;
    private int[] gradientColors = {
            0xFFFFFFFF,
            0xE6FFFFFF
    };
    private float progress = 0f;
    private float shadowOpacity = 0f;
    private float shadowRadius = 0f;
    private boolean isLine = false;
    private boolean gradientDirty = true;
    private CharSequence shaderText;
    private float shaderTextSize = -1f;
    private int shaderHeight = -1;
    private Typeface shaderTypeface;

    public double startTime;
    public double duration;
    public double startScale;
    public double durationScale;

    public GradientTextView(Context context) {
        super(context);
    }

    public GradientTextView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    public GradientTextView(Context context, AttributeSet attrs, int defStyle) {
        super(context, attrs, defStyle);
    }

    public View motionView() { return this; }
    protected void onAttachedToWindow() { super.onAttachedToWindow(); motionCanvas = MotionTarget.register(this); }
    protected void onDetachedFromWindow() {
        MotionTarget.unregister(this, motionCanvas); motionCanvas = null; super.onDetachedFromWindow();
    }
    public void animateMotion(double positionMs) {
        if (!motionTrack.sample(positionMs)) return;
        float[] values = motionTrack.value;
        setProgress(values[0] * 100); setGlow(values[1], values[2]);
        setTranslationY(values[3] * getResources().getDisplayMetrics().density);
        setScaleX(values[4]); setScaleY(values[4]); setAlpha(values[5]);
    }

    @Override
    protected void onDraw(Canvas canvas) {
        Paint paint = getPaint();
        if (gradientDirty || shaderTextSize != getTextSize() || shaderHeight != getHeight() || shaderTypeface != getTypeface()
                || !TextUtils.equals(shaderText, getText())) {
            updateGradient(paint);
        }
        super.onDraw(canvas);
    }

    private void updateGradient(Paint paint) {
        boolean geometryChanged = shaderTextSize != getTextSize() || shaderTypeface != getTypeface()
                || !TextUtils.equals(shaderText, getText());
        if (geometryChanged) shaderWidth = paint.measureText(getText().toString());
        float width = shaderWidth;
        float height = getHeight();

        final float fadeWidth = 0.3f;
        final float fadeWidthLine = 0.3f;
        float gradientProgress = Math.max(0f, Math.min(progress, 1f));

        float startFade = Math.max(0f, gradientProgress - (isLine ? fadeWidthLine : fadeWidth) / 2f);
        float endFade = Math.min(1f, gradientProgress + (isLine ? fadeWidthLine : fadeWidth) / 2f);

        if (colorsDirty || activeShader == null) {
            activeShader = new LinearGradient(0, 0, isLine ? 0 : 1, isLine ? 1 : 0,
                    gradientColors, null, Shader.TileMode.CLAMP);
            idleShader = new LinearGradient(0, 0, 1, 0, gradientColors[1], gradientColors[1], Shader.TileMode.CLAMP);
            sungShader = new LinearGradient(0, 0, 1, 0, gradientColors[0], gradientColors[0], Shader.TileMode.CLAMP);
            colorsDirty = false;
        }
        if (gradientProgress <= 0) paint.setShader(idleShader);
        else if (gradientProgress >= 1) paint.setShader(sungShader);
        else {
            float extent = Math.max(0.001f, (isLine ? height : width) * (endFade - startFade));
            gradientMatrix.setScale(isLine ? 1 : extent, isLine ? extent : 1);
            gradientMatrix.postTranslate(isLine ? 0 : width * startFade, isLine ? height * startFade : 0);
            activeShader.setLocalMatrix(gradientMatrix);
            paint.setShader(activeShader);
        }
        gradientDirty = false;
        shaderText = getText();
        shaderTextSize = getTextSize();
        shaderHeight = getHeight();
        shaderTypeface = getTypeface();
    }

    public void setGradientColors(int[] gradientColors) {
        if (Arrays.equals(this.gradientColors, gradientColors)) return;
        this.gradientColors = gradientColors;
        colorsDirty = true;
        gradientDirty = true;
        invalidate();
    }

    public void setLineState(boolean isLine) {
        if (this.isLine == isLine) return;
        this.isLine = isLine;
        colorsDirty = true;
        gradientDirty = true;
        invalidate();
    }

    public void setGlowOpacity(float opacity) {
        setGlow(shadowRadius, opacity);
    }

    public void setGlowRadius(float radius) {
        setGlow(radius, shadowOpacity);
    }

    public float getGlowRadius() { return shadowRadius; }
    public float getGlowOpacity() { return shadowOpacity; }

    public void setGlow(float radius, float opacity) {
        float nextRadius = Math.max(0f, radius);
        float nextOpacity = Math.max(0f, Math.min(1f, opacity));
        if (shadowRadius == nextRadius && shadowOpacity == nextOpacity) return;
        shadowRadius = nextRadius;
        shadowOpacity = nextOpacity;
        applyGlow();
    }

    private void applyGlow() {
        setShadowLayer(shadowRadius, 0f, 0f,
                Color.argb(Math.round(255 * shadowOpacity), 255, 255, 255));
    }

    public void setProgress(float progress) {
        float nextProgress = Math.max(0f, Math.min(progress / 100f, 1f));
        if (this.progress == nextProgress) return;
        this.progress = nextProgress;
        gradientDirty = true;
        invalidate();
    }
}
