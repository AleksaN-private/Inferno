package com.inferno.app;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

import java.io.ByteArrayOutputStream;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

/**
 * Launcher — kontrola telefona (1. korak): lista instaliranih aplikacija,
 * njihove ikonice (na zahtev) i otvaranje. Zove se iz web Inferna preko
 * window.Capacitor.Plugins.Launcher.
 */
@CapacitorPlugin(name = "Launcher")
public class LauncherPlugin extends Plugin {

    @PluginMethod
    public void listApps(PluginCall call) {
        final PackageManager pm = getContext().getPackageManager();
        Intent main = new Intent(Intent.ACTION_MAIN, null);
        main.addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> list = pm.queryIntentActivities(main, 0);
        Collections.sort(list, new Comparator<ResolveInfo>() {
            public int compare(ResolveInfo a, ResolveInfo b) {
                return a.loadLabel(pm).toString().compareToIgnoreCase(b.loadLabel(pm).toString());
            }
        });
        JSONArray arr = new JSONArray();
        String self = getContext().getPackageName();
        for (ResolveInfo ri : list) {
            String pkg = ri.activityInfo.packageName;
            if (self.equals(pkg)) continue;   // ne prikazuj samog Inferna
            JSObject o = new JSObject();
            o.put("label", ri.loadLabel(pm).toString());
            o.put("package", pkg);
            arr.put(o);
        }
        JSObject ret = new JSObject();
        ret.put("apps", arr);
        call.resolve(ret);
    }

    @PluginMethod
    public void getIcon(PluginCall call) {
        String pkg = call.getString("package");
        if (pkg == null) { call.reject("no package"); return; }
        try {
            PackageManager pm = getContext().getPackageManager();
            Drawable d = pm.getApplicationIcon(pkg);
            int size = 96;
            Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
            Canvas c = new Canvas(bmp);
            d.setBounds(0, 0, size, size);
            d.draw(c);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            bmp.compress(Bitmap.CompressFormat.PNG, 100, out);
            String b64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
            JSObject ret = new JSObject();
            ret.put("icon", "data:image/png;base64," + b64);
            call.resolve(ret);
        } catch (Exception e) { call.reject("no icon"); }
    }

    @PluginMethod
    public void openApp(PluginCall call) {
        String pkg = call.getString("package");
        if (pkg == null) { call.reject("no package"); return; }
        Intent launch = getContext().getPackageManager().getLaunchIntentForPackage(pkg);
        if (launch == null) { call.reject("not found"); return; }
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(launch);
        call.resolve();
    }
}
