package com.inferno.app;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LauncherPlugin.class);
        registerPlugin(HotwordPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        // Servis nas je probudio na "hej Inferno" -> javi web sloju da počne da sluša komandu.
        if (intent != null && intent.getBooleanExtra("wake", false)) {
            HotwordPlugin.emitWake();
        }
    }
}
