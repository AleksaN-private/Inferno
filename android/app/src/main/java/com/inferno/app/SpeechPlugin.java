package com.inferno.app;

import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;

/**
 * Nativno prepoznavanje govora (Google, sr-RS) — jer Android WebView nema Web Speech API.
 * Web sloj: window.Capacitor.Plugins.Speech.
 *  - available(): da li uređaj ima prepoznavanje
 *  - listen({lang}): jedno izgovaranje -> resolve {text, error}
 *  - emituje 'rms' (jačina glasa, za vizuelizaciju) i 'partial' (delimičan tekst)
 */
@CapacitorPlugin(name = "Speech")
public class SpeechPlugin extends Plugin {

    private SpeechRecognizer sr;
    private PluginCall pending;

    @PluginMethod
    public void available(PluginCall call) {
        JSObject r = new JSObject();
        try { r.put("value", SpeechRecognizer.isRecognitionAvailable(getContext())); }
        catch (Exception e) { r.put("value", false); }
        call.resolve(r);
    }

    @PluginMethod
    public void listen(final PluginCall call) {
        final String lang = call.getString("lang", "sr-RS");
        if (getActivity() == null) { call.reject("no activity"); return; }
        getActivity().runOnUiThread(new Runnable() {
            public void run() {
                try {
                    if (!SpeechRecognizer.isRecognitionAvailable(getContext())) { call.reject("unavailable"); return; }
                    destroy();
                    pending = call;
                    sr = SpeechRecognizer.createSpeechRecognizer(getContext());
                    sr.setRecognitionListener(new RecognitionListener() {
                        public void onResults(Bundle b) {
                            ArrayList<String> a = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                            JSObject r = new JSObject();
                            r.put("text", (a != null && !a.isEmpty()) ? a.get(0) : "");
                            done(r);
                        }
                        public void onPartialResults(Bundle b) {
                            ArrayList<String> a = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                            if (a != null && !a.isEmpty()) {
                                JSObject e = new JSObject(); e.put("text", a.get(0));
                                notifyListeners("partial", e);
                            }
                        }
                        public void onError(int err) { JSObject r = new JSObject(); r.put("text", ""); r.put("error", err); done(r); }
                        public void onRmsChanged(float v) { JSObject e = new JSObject(); e.put("v", v); notifyListeners("rms", e); }
                        public void onReadyForSpeech(Bundle b) { notifyListeners("ready", new JSObject()); }
                        public void onBeginningOfSpeech() {}
                        public void onEndOfSpeech() {}
                        public void onBufferReceived(byte[] x) {}
                        public void onEvent(int i, Bundle b) {}
                    });
                    Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                    i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                    i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
                    i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, lang);
                    i.putExtra(RecognizerIntent.EXTRA_ONLY_RETURN_LANGUAGE_PREFERENCE, false);
                    i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
                    i.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getContext().getPackageName());
                    sr.startListening(i);
                } catch (Exception e) {
                    pending = null;
                    call.reject("listen failed: " + e.getMessage());
                }
            }
        });
    }

    private void done(JSObject r) {
        PluginCall c = pending; pending = null;
        if (c != null) c.resolve(r);
        destroy();
    }

    private void destroy() {
        if (sr != null) { try { sr.destroy(); } catch (Exception e) {} sr = null; }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (getActivity() != null) getActivity().runOnUiThread(new Runnable() {
            public void run() { destroy(); }
        });
        call.resolve();
    }
}
