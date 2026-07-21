package com.inferno.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import java.util.ArrayList;

/**
 * Pozadinski glas-servis: neprekidno sluša preko Google prepoznavanja (sr-RS) i budi aplikaciju
 * kad čuje „Inferno" — radi i dok si u drugim aplikacijama (foreground servis sa mikrofonom).
 * Web sloj ga pali/gasi preko HotwordPlugin (start/stop): pali se kad app ode u pozadinu.
 */
public class HotwordService extends Service implements RecognitionListener {

    private static final String TAG = "InfernoHotword";
    private static final String CHANNEL = "inferno_hotword";
    private static final int NOTIF_ID = 4711;

    private SpeechRecognizer sr;
    private final Handler main = new Handler(Looper.getMainLooper());
    private boolean running = false;
    private long lastWake = 0L;
    private PowerManager.WakeLock wl;

    @Override
    public void onCreate() {
        super.onCreate();
        startAsForeground();
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "inferno:hotword");
            wl.setReferenceCounted(false);
        } catch (Exception e) { wl = null; }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        running = true;
        try { if (wl != null && !wl.isHeld()) wl.acquire(); } catch (Exception e) {}   // drži procesor budnim (i kad je ekran ugašen)
        main.post(this::listenOnce);
        return START_STICKY;
    }

    private void startAsForeground() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Inferno sluša",
                    NotificationManager.IMPORTANCE_MIN);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        Intent open = new Intent(this, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) piFlags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, piFlags);

        Notification n = new NotificationCompat.Builder(this, CHANNEL)
                .setContentTitle("Inferno")
                .setContentText("Slušam — reci „Inferno“")
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setContentIntent(pi)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_MIN)
                .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        } else {
            startForeground(NOTIF_ID, n);
        }
    }

    private void listenOnce() {
        if (!running) return;
        try {
            // NE diraj mikrofon dok svira video/muzika (YouTube i sl.) — inače se reprodukcija secka.
            AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (am != null && am.isMusicActive()) { main.postDelayed(this::listenOnce, 1500); return; }
            if (!SpeechRecognizer.isRecognitionAvailable(this)) { Log.e(TAG, "no recognition"); return; }
            if (sr == null) { sr = SpeechRecognizer.createSpeechRecognizer(this); sr.setRecognitionListener(this); }
            Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "sr-RS");
            i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            i.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());
            // OSETLJIVOST: sluša strpljivije (duža tišina pre kraja) -> bolje hvata tiši/dalji glas
            i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1800L);
            i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1800L);
            i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 800L);
            i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
            sr.startListening(i);
        } catch (Exception e) {
            Log.e(TAG, "listen " + e.getMessage());
            restart(900);
        }
    }

    private void restart(long delayMs) {
        if (!running) return;
        main.postDelayed(() -> { try { if (sr != null) sr.cancel(); } catch (Exception e) {} listenOnce(); }, delayMs);
    }

    private boolean matches(String t) {
        if (t == null) return false;
        t = t.toLowerCase();
        return t.contains("inferno") || t.contains("infern") || t.contains("in fern") || t.contains("infer no");
    }

    private void handle(Bundle b) {
        ArrayList<String> a = b != null ? b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION) : null;
        if (a == null || a.isEmpty()) return;
        String top = a.get(0);
        if (top != null && !top.isEmpty()) HotwordPlugin.emitHeard(top);
        for (String cand : a) { if (matches(cand)) { wake(); return; } }   // proveri SVE alternative -> bolje hvata „Inferno"
    }

    private void wake() {
        long now = SystemClock.elapsedRealtime();
        if (now - lastWake < 3000) return;
        lastWake = now;
        Log.i(TAG, "WAKE");
        Intent open = new Intent(this, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        open.putExtra("wake", true);
        try { startActivity(open); } catch (Exception ignored) {}
        HotwordPlugin.emitWake();
    }

    @Override public void onResults(Bundle b) { handle(b); restart(120); }
    @Override public void onPartialResults(Bundle b) { handle(b); }
    @Override public void onError(int err) { restart(err == SpeechRecognizer.ERROR_RECOGNIZER_BUSY ? 900 : 250); }
    @Override public void onReadyForSpeech(Bundle b) {}
    @Override public void onBeginningOfSpeech() {}
    @Override public void onRmsChanged(float v) {}
    @Override public void onBufferReceived(byte[] x) {}
    @Override public void onEndOfSpeech() {}
    @Override public void onEvent(int i, Bundle b) {}

    @Override
    public void onDestroy() {
        running = false;
        try { if (wl != null && wl.isHeld()) wl.release(); } catch (Exception e) {}
        main.post(() -> { if (sr != null) { try { sr.destroy(); } catch (Exception e) {} sr = null; } });
        super.onDestroy();
    }

    @Nullable @Override public IBinder onBind(Intent intent) { return null; }
}
