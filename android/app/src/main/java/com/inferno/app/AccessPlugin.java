package com.inferno.app;

import android.content.Intent;
import android.provider.Settings;
import android.util.DisplayMetrics;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Web most ka Accessibility sloju: window.Capacitor.Plugins.Access.
 *  - isEnabled/openSettings — provera i uključivanje (korisnik ručno odobri)
 *  - click(text)/clickId(id) — kucni dugme/stavku po tekstu ili view-id
 *  - tap(x,y)/swipe(dir) — dodir/prevlačenje (x,y su 0..1 od širine/visine ekrana)
 *  - back/home/recents/notifications — sistemske akcije
 */
@CapacitorPlugin(name = "Access")
public class AccessPlugin extends Plugin {

    private InfernoAccessibilityService svc() { return InfernoAccessibilityService.instance; }
    private void needSvc(PluginCall call) { call.reject("accessibility_off"); }

    @PluginMethod
    public void isEnabled(PluginCall call) {
        JSObject r = new JSObject(); r.put("value", InfernoAccessibilityService.isOn()); call.resolve(r);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { getContext().startActivity(i); call.resolve(); } catch (Exception e) { call.reject("open failed"); }
    }

    @PluginMethod
    public void click(PluginCall call) {
        InfernoAccessibilityService s = svc(); if (s == null) { needSvc(call); return; }
        boolean ok = s.clickText(call.getString("text", ""));
        JSObject r = new JSObject(); r.put("ok", ok); call.resolve(r);
    }

    @PluginMethod
    public void clickId(PluginCall call) {
        InfernoAccessibilityService s = svc(); if (s == null) { needSvc(call); return; }
        boolean ok = s.clickId(call.getString("id", ""));
        JSObject r = new JSObject(); r.put("ok", ok); call.resolve(r);
    }

    @PluginMethod
    public void tap(PluginCall call) {
        InfernoAccessibilityService s = svc(); if (s == null) { needSvc(call); return; }
        DisplayMetrics dm = getContext().getResources().getDisplayMetrics();
        float x = (float) (call.getDouble("x", 0.5) * dm.widthPixels);
        float y = (float) (call.getDouble("y", 0.5) * dm.heightPixels);
        JSObject r = new JSObject(); r.put("ok", s.tap(x, y)); call.resolve(r);
    }

    @PluginMethod
    public void swipe(PluginCall call) {
        InfernoAccessibilityService s = svc(); if (s == null) { needSvc(call); return; }
        DisplayMetrics dm = getContext().getResources().getDisplayMetrics();
        int w = dm.widthPixels, h = dm.heightPixels;
        String dir = call.getString("dir", "down");
        float x1 = w * 0.5f, y1 = h * 0.5f, x2 = x1, y2 = y1;
        if ("down".equals(dir))      { y1 = h * 0.30f; y2 = h * 0.75f; }
        else if ("up".equals(dir))   { y1 = h * 0.75f; y2 = h * 0.30f; }
        else if ("left".equals(dir)) { x1 = w * 0.80f; x2 = w * 0.20f; }
        else if ("right".equals(dir)){ x1 = w * 0.20f; x2 = w * 0.80f; }
        JSObject r = new JSObject(); r.put("ok", s.swipe(x1, y1, x2, y2, 260)); call.resolve(r);
    }

    @PluginMethod
    public void back(PluginCall call)          { act(call, InfernoAccessibilityService.GLOBAL_ACTION_BACK); }
    @PluginMethod
    public void home(PluginCall call)          { act(call, InfernoAccessibilityService.GLOBAL_ACTION_HOME); }
    @PluginMethod
    public void recents(PluginCall call)       { act(call, InfernoAccessibilityService.GLOBAL_ACTION_RECENTS); }
    @PluginMethod
    public void notifications(PluginCall call)  { act(call, InfernoAccessibilityService.GLOBAL_ACTION_NOTIFICATIONS); }

    private void act(PluginCall call, int action) {
        InfernoAccessibilityService s = svc(); if (s == null) { needSvc(call); return; }
        JSObject r = new JSObject(); r.put("ok", s.global(action)); call.resolve(r);
    }
}
