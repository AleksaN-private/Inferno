package com.inferno.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.media.AudioManager;
import android.net.Uri;
import android.provider.AlarmClock;
import android.provider.ContactsContract;
import android.provider.Settings;
import android.telephony.SmsManager;
import android.util.Base64;
import android.view.KeyEvent;

import androidx.core.app.ActivityCompat;

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
 * Launcher / Kontrola telefona — zove se iz web Inferna preko window.Capacitor.Plugins.Launcher.
 * Aplikacije: listApps, getIcon, openApp.
 * Kontrola: call, dial, sendSms, smsCompose, findContacts, webSearch, openUrl,
 *           setAlarm, setTimer, media, openSettings, requestPerms.
 */
@CapacitorPlugin(name = "Launcher")
public class LauncherPlugin extends Plugin {

    private void newTask(Intent i) { i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); }

    // ---------- APLIKACIJE ----------
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
            if (self.equals(pkg)) continue;
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
        newTask(launch);
        getContext().startActivity(launch);
        call.resolve();
    }

    // ---------- POZIVI ----------
    @PluginMethod
    public void call(PluginCall call) {
        String num = call.getString("number", "");
        if (num == null || num.isEmpty()) { call.reject("no number"); return; }
        Uri u = Uri.parse("tel:" + num.replaceAll("[^0-9+#*]", ""));
        try {
            Intent i = new Intent(Intent.ACTION_CALL, u); newTask(i);
            getContext().startActivity(i);
            call.resolve();
        } catch (SecurityException e) {   // nema CALL_PHONE dozvole -> otvori birač
            Intent d = new Intent(Intent.ACTION_DIAL, u); newTask(d);
            getContext().startActivity(d);
            JSObject r = new JSObject(); r.put("dialer", true); call.resolve(r);
        } catch (Exception e) { call.reject("call failed"); }
    }

    @PluginMethod
    public void dial(PluginCall call) {
        String num = call.getString("number", "");
        Intent d = new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + num)); newTask(d);
        getContext().startActivity(d); call.resolve();
    }

    // ---------- PORUKE ----------
    @PluginMethod
    public void sendSms(PluginCall call) {
        String num = call.getString("number", "");
        String text = call.getString("text", "");
        if (num == null || num.isEmpty()) { call.reject("no number"); return; }
        try {
            SmsManager sms = SmsManager.getDefault();
            sms.sendTextMessage(num, null, text, null, null);
            call.resolve();
        } catch (Exception e) {   // nema SEND_SMS -> otvori aplikaciju za poruke sa popunjenim tekstom
            smsCompose(call);
        }
    }

    @PluginMethod
    public void smsCompose(PluginCall call) {
        String num = call.getString("number", "");
        String text = call.getString("text", "");
        Intent i = new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + num));
        i.putExtra("sms_body", text); newTask(i);
        try { getContext().startActivity(i); call.resolve(); } catch (Exception e) { call.reject("sms failed"); }
    }

    // ---------- KONTAKTI ----------
    @PluginMethod
    public void findContacts(PluginCall call) {
        String q = call.getString("query", "");
        JSONArray arr = new JSONArray();
        try {
            Cursor cur = getContext().getContentResolver().query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                new String[]{ ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, ContactsContract.CommonDataKinds.Phone.NUMBER },
                (q != null && !q.isEmpty()) ? (ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " LIKE ?") : null,
                (q != null && !q.isEmpty()) ? new String[]{ "%" + q + "%" } : null,
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC");
            int n = 0;
            if (cur != null) {
                while (cur.moveToNext() && n < 30) {
                    JSObject o = new JSObject();
                    o.put("name", cur.getString(0));
                    o.put("number", cur.getString(1));
                    arr.put(o); n++;
                }
                cur.close();
            }
        } catch (Exception e) { /* nema READ_CONTACTS ili greška -> prazna lista */ }
        JSObject ret = new JSObject(); ret.put("contacts", arr); call.resolve(ret);
    }

    // ---------- INTERNET / PRETRAGA ----------
    @PluginMethod
    public void webSearch(PluginCall call) {
        String q = call.getString("query", "");
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com/search?q=" + Uri.encode(q)));
        newTask(i);
        try { getContext().startActivity(i); call.resolve(); } catch (Exception e) { call.reject("search failed"); }
    }

    @PluginMethod
    public void youtube(PluginCall call) {
        String q = call.getString("query", "");
        Uri u = Uri.parse("https://www.youtube.com/results?search_query=" + Uri.encode(q));
        // probaj direktno u YouTube aplikaciji; ako je nema, otvori u pregledaču
        Intent yt = new Intent(Intent.ACTION_VIEW, u);
        yt.setPackage("com.google.android.youtube");
        newTask(yt);
        try { getContext().startActivity(yt); call.resolve(); return; }
        catch (Exception ignored) {}
        Intent web = new Intent(Intent.ACTION_VIEW, u); newTask(web);
        try { getContext().startActivity(web); call.resolve(); } catch (Exception e) { call.reject("youtube failed"); }
    }

    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url", "");
        if (url != null && !url.matches("^https?://.*")) url = "https://" + url;
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url)); newTask(i);
        try { getContext().startActivity(i); call.resolve(); } catch (Exception e) { call.reject("open failed"); }
    }

    // ---------- SAT / VREME ----------
    @PluginMethod
    public void setAlarm(PluginCall call) {
        int h = call.getInt("hour", 8);
        int m = call.getInt("minute", 0);
        String msg = call.getString("message", "Inferno alarm");
        Intent i = new Intent(AlarmClock.ACTION_SET_ALARM);
        i.putExtra(AlarmClock.EXTRA_HOUR, h);
        i.putExtra(AlarmClock.EXTRA_MINUTES, m);
        i.putExtra(AlarmClock.EXTRA_MESSAGE, msg);
        i.putExtra(AlarmClock.EXTRA_SKIP_UI, false);
        newTask(i);
        try { getContext().startActivity(i); call.resolve(); } catch (Exception e) { call.reject("alarm failed"); }
    }

    @PluginMethod
    public void setTimer(PluginCall call) {
        int sec = call.getInt("seconds", 60);
        String msg = call.getString("message", "Inferno tajmer");
        Intent i = new Intent(AlarmClock.ACTION_SET_TIMER);
        i.putExtra(AlarmClock.EXTRA_LENGTH, sec);
        i.putExtra(AlarmClock.EXTRA_MESSAGE, msg);
        i.putExtra(AlarmClock.EXTRA_SKIP_UI, true);
        newTask(i);
        try { getContext().startActivity(i); call.resolve(); } catch (Exception e) { call.reject("timer failed"); }
    }

    // ---------- MUZIKA ----------
    @PluginMethod
    public void media(PluginCall call) {
        String action = call.getString("action", "playpause");
        int key;
        if ("next".equals(action)) key = KeyEvent.KEYCODE_MEDIA_NEXT;
        else if ("prev".equals(action) || "previous".equals(action)) key = KeyEvent.KEYCODE_MEDIA_PREVIOUS;
        else if ("play".equals(action)) key = KeyEvent.KEYCODE_MEDIA_PLAY;
        else if ("pause".equals(action) || "stop".equals(action)) key = KeyEvent.KEYCODE_MEDIA_PAUSE;
        else key = KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE;
        try {
            AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            am.dispatchMediaKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, key));
            am.dispatchMediaKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, key));
            call.resolve();
        } catch (Exception e) { call.reject("media failed"); }
    }

    // ---------- PODEŠAVANJA (wifi/podaci se ne mogu paliti programski od Androida 10 — otvaramo panel) ----------
    @PluginMethod
    public void openSettings(PluginCall call) {
        String which = call.getString("which", "");
        String act;
        switch (which) {
            case "wifi": act = Settings.ACTION_WIFI_SETTINGS; break;
            case "data": act = Settings.ACTION_DATA_ROAMING_SETTINGS; break;
            case "bluetooth": act = Settings.ACTION_BLUETOOTH_SETTINGS; break;
            case "sound": act = Settings.ACTION_SOUND_SETTINGS; break;
            case "display": act = Settings.ACTION_DISPLAY_SETTINGS; break;
            case "battery": act = Settings.ACTION_BATTERY_SAVER_SETTINGS; break;
            case "location": act = Settings.ACTION_LOCATION_SOURCE_SETTINGS; break;
            case "apps": act = Settings.ACTION_APPLICATION_SETTINGS; break;
            default: act = Settings.ACTION_SETTINGS;
        }
        Intent i = new Intent(act); newTask(i);
        try { getContext().startActivity(i); call.resolve(); } catch (Exception e) { call.reject("settings failed"); }
    }

    // ---------- DOZVOLE (pozivi, kontakti, poruke) ----------
    @PluginMethod
    public void requestPerms(PluginCall call) {
        try {
            String[] p = new String[]{ Manifest.permission.CALL_PHONE, Manifest.permission.READ_CONTACTS, Manifest.permission.SEND_SMS };
            if (getActivity() != null) ActivityCompat.requestPermissions(getActivity(), p, 7001);
        } catch (Exception e) {}
        call.resolve();
    }
}
