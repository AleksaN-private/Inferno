package com.inferno.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Upravlja hotword servisom iz web Inferna: window.Capacitor.Plugins.Hotword.
 *  - start(): traži dozvolu za mikrofon i pokreće uvek-uklj. slušanje "hej Inferno"
 *  - stop(): gasi servis
 *  - dogadjaj "wake" se emituje web sloju kada se čuje hotword
 */
@CapacitorPlugin(name = "Hotword")
public class HotwordPlugin extends Plugin {

    private static HotwordPlugin instance;

    @Override
    public void load() { instance = this; }

    /** Zove ga HotwordService kad prepozna hotword. */
    public static void emitWake() {
        if (instance != null) {
            instance.notifyListeners("wake", new JSObject().put("source", "vosk"));
        }
    }

    /** Debug: šta Vosk trenutno čuje (da vidimo da li uopšte hvata glas / „inferno"). */
    public static void emitHeard(String text) {
        if (instance != null) {
            instance.notifyListeners("heard", new JSObject().put("text", text == null ? "" : text));
        }
    }

    @PluginMethod
    public void start(PluginCall call) {
        boolean mic = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED;
        if (!mic) {
            if (getActivity() != null) {
                ActivityCompat.requestPermissions(getActivity(),
                        new String[]{ Manifest.permission.RECORD_AUDIO }, 7010);
            }
            JSObject r = new JSObject(); r.put("started", false); r.put("needMic", true);
            call.resolve(r);
            return;
        }
        Intent svc = new Intent(getContext(), HotwordService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) getContext().startForegroundService(svc);
        else getContext().startService(svc);
        JSObject r = new JSObject(); r.put("started", true); call.resolve(r);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), HotwordService.class));
        call.resolve();
    }

    @PluginMethod
    public void isRunning(PluginCall call) {
        JSObject r = new JSObject(); r.put("value", instance != null); call.resolve(r);
    }
}
