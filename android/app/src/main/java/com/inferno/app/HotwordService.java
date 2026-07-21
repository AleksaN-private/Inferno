package com.inferno.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;
import org.vosk.android.RecognitionListener;
import org.vosk.android.SpeechService;
import org.vosk.android.StorageService;

/**
 * Uvek-uklj. hotword servis: sluša "hej Inferno" offline (Vosk) i budi aplikaciju.
 * Model se raspakuje iz assets/model u interni memorijski prostor pri prvom startu.
 */
public class HotwordService extends android.app.Service implements RecognitionListener {

    private static final String TAG = "InfernoHotword";
    private static final String CHANNEL = "inferno_hotword";
    private static final int NOTIF_ID = 4711;

    private Model model;
    private SpeechService speech;
    private long lastWake = 0L;

    @Override
    public void onCreate() {
        super.onCreate();
        startAsForeground();
        initModel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
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
                .setContentText("Slušam — reci „hej Inferno“")
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

    private void initModel() {
        StorageService.unpack(this, "model", "vosk-model",
                (Model m) -> { model = m; startListening(); },
                (java.io.IOException e) -> Log.e(TAG, "unpack model fail: " + e.getMessage()));
    }

    private void startListening() {
        try {
            // Grammar-ograničen prepoznavač: sluša samo hotword -> mnogo tačnije i štedi bateriju.
            Recognizer rec = new Recognizer(model, 16000.0f,
                    "[\"hej inferno\", \"hey inferno\", \"inferno\", \"[unk]\"]");
            speech = new SpeechService(rec, 16000.0f);
            speech.startListening(this);
            Log.i(TAG, "hotword listening");
        } catch (Exception e) {
            Log.e(TAG, "startListening fail: " + e.getMessage());
        }
    }

    private boolean hit(String json) {
        if (json == null) return false;
        try {
            JSONObject o = new JSONObject(json);
            String t = o.optString("text", o.optString("partial", ""));
            return t != null && t.toLowerCase().contains("inferno");
        } catch (Exception e) { return json.toLowerCase().contains("inferno"); }
    }

    private void wake() {
        long now = android.os.SystemClock.elapsedRealtime();
        if (now - lastWake < 2500) return;   // debouncing
        lastWake = now;
        Log.i(TAG, "WAKE");
        // 1) dovedi aplikaciju u prvi plan
        Intent open = new Intent(this, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        open.putExtra("wake", true);
        try { startActivity(open); } catch (Exception ignored) {}
        // 2) javi web sloju (ako je plugin živ)
        HotwordPlugin.emitWake();
    }

    @Override public void onPartialResult(String h) { if (hit(h)) wake(); }
    @Override public void onResult(String h)        { if (hit(h)) wake(); }
    @Override public void onFinalResult(String h)   { if (hit(h)) wake(); }
    @Override public void onError(Exception e)      { Log.e(TAG, "err " + e.getMessage()); }
    @Override public void onTimeout()               { }

    @Override
    public void onDestroy() {
        if (speech != null) { speech.stop(); speech.shutdown(); speech = null; }
        super.onDestroy();
    }

    @Nullable @Override public IBinder onBind(Intent intent) { return null; }
}
