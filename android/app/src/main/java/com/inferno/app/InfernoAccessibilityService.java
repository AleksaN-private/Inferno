package com.inferno.app;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.graphics.Path;
import android.os.Build;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import java.util.List;

/**
 * Accessibility sloj: Inferno „vidi" ekran i sam kuca po dugmadima u BILO KOJOJ aplikaciji.
 * Korisnik ga ručno uključi u Podešavanja → Pristupačnost → Inferno.
 * Web sloj ga poziva preko AccessPlugin-a (klikni tekst, skrol, tap, nazad/home/…).
 */
public class InfernoAccessibilityService extends AccessibilityService {

    static InfernoAccessibilityService instance;

    @Override public void onServiceConnected() { instance = this; }
    @Override public void onAccessibilityEvent(AccessibilityEvent event) { }
    @Override public void onInterrupt() { }
    @Override public boolean onUnbind(android.content.Intent intent) { if (instance == this) instance = null; return super.onUnbind(intent); }
    @Override public void onDestroy() { if (instance == this) instance = null; super.onDestroy(); }

    static boolean isOn() { return instance != null; }

    /** Klikni prvi element čiji tekst (ili opis) sadrži zadato. */
    boolean clickText(String text) {
        if (text == null || text.isEmpty()) return false;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return false;
        List<AccessibilityNodeInfo> found = root.findAccessibilityNodeInfosByText(text);
        if (found != null) {
            for (AccessibilityNodeInfo n : found) {
                AccessibilityNodeInfo c = n;
                while (c != null) {
                    if (c.isClickable() && c.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true;
                    c = c.getParent();
                }
            }
        }
        return false;
    }

    /** Klikni prvi element sa datim view-id (npr. play dugme). */
    boolean clickId(String viewId) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return false;
        List<AccessibilityNodeInfo> found = root.findAccessibilityNodeInfosByViewId(viewId);
        if (found != null) {
            for (AccessibilityNodeInfo n : found) {
                if (n.isClickable() && n.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true;
            }
        }
        return false;
    }

    boolean tap(float x, float y) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false;
        Path p = new Path(); p.moveTo(x, y);
        GestureDescription g = new GestureDescription.Builder()
                .addStroke(new GestureDescription.StrokeDescription(p, 0, 60)).build();
        return dispatchGesture(g, null, null);
    }

    boolean swipe(float x1, float y1, float x2, float y2, int ms) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false;
        Path p = new Path(); p.moveTo(x1, y1); p.lineTo(x2, y2);
        GestureDescription g = new GestureDescription.Builder()
                .addStroke(new GestureDescription.StrokeDescription(p, 0, ms)).build();
        return dispatchGesture(g, null, null);
    }

    boolean global(int action) { return performGlobalAction(action); }
}
