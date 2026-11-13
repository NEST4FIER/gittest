package org.fiercoin.wallet;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.MediaStore;
import android.provider.Settings;
import android.webkit.JavascriptInterface;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Functions the app's web page can call (window.Fier). */
public final class Bridge {
private final MainActivity a;

Bridge(MainActivity a) {
    this.a = a;
}

    @JavascriptInterface
    public void start() {
        a.startForegroundService(new Intent(a, NodeService.class));
    }

    @JavascriptInterface
    public void stop() {
        a.startService(new Intent(a, NodeService.class).setAction(NodeService.ACTION_STOP));
    }

    @JavascriptInterface
    public boolean running() {
        return NodeService.isRunning();
    }

    @JavascriptInterface
    public String rpc(String method, String params) {
        return Node.rpc(a, "/", method, params);
    }

    @JavascriptInterface
    public String walletRpc(String method, String params) {
        return Node.rpc(a, "/wallet/" + Node.WALLET, method, params);
    }

    @JavascriptInterface
    public String nodes() {
        return String.join(",", Node.nodes(a));
    }

    @JavascriptInterface
    public void addNode(String node) {
        Node.addNode(a, node);
        for (String n : Node.nodes(a)) {
            Node.rpc(a, "/", "addnode", "[\"" + n + "\",\"add\"]");
        }
    }

    @JavascriptInterface
    public void removeNode(String node) {
        Node.rpc(a, "/", "addnode", "[\"" + node.replace("\"", "") + "\",\"remove\"]");
        Node.removeNode(a, node);
    }

    @JavascriptInterface
    public String lastError() {
        String e = Node.prefs(a).getString("lasterror", "");
        Node.prefs(a).edit().remove("lasterror").apply();
        return e;
    }

    @JavascriptInterface
    public int cpuCount() {
        return Runtime.getRuntime().availableProcessors();
    }

    @JavascriptInterface
    public void copy(String text) {
        ClipboardManager cm = (ClipboardManager) a.getSystemService(Context.CLIPBOARD_SERVICE);
        cm.setPrimaryClip(ClipData.newPlainText("FierCoin", text));
    }

    @JavascriptInterface
    public void batterySettings() {
        PowerManager pm = (PowerManager) a.getSystemService(Context.POWER_SERVICE);
            try {
                if (!pm.isIgnoringBatteryOptimizations(a.getPackageName())) {
                    a.startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + a.getPackageName())));
                } else {
                    a.startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
                }
            } catch (Exception ignored) {
            }
    }

    /** Saves a wallet backup into the phone's Downloads folder. Returns a message for the user. */
    @JavascriptInterface
    public String backup() {
        String name = "fiercoin-wallet-backup-" + new SimpleDateFormat("yyyyMMdd-HHmm", Locale.US).format(new Date()) + ".dat";
        File tmp = new File(a.getCacheDir(), name);
        tmp.delete();
        String reply = walletRpc("backupwallet", "[\"" + tmp.getAbsolutePath() + "\"]");
        if (!tmp.exists()) return "Backup failed: " + reply;
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                v.put(MediaStore.Downloads.MIME_TYPE, "application/octet-stream");
                Uri uri = a.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                try (InputStream in = new FileInputStream(tmp); OutputStream out = a.getContentResolver().openOutputStream(uri)) {
                    byte[] buf = new byte[65536];
                    int r;
                    while ((r = in.read(buf)) > 0) out.write(buf, 0, r);
                }
                return "Saved to your Downloads folder as " + name + ". Copy it to a safe place (USB stick, your PC).";
            }
            File dest = new File(a.getExternalFilesDir(null), name);
            try (InputStream in = new FileInputStream(tmp); OutputStream out = new java.io.FileOutputStream(dest)) {
                byte[] buf = new byte[65536];
                int r;
                while ((r = in.read(buf)) > 0) out.write(buf, 0, r);
            }
            return "Saved to " + dest.getAbsolutePath();
        } catch (Exception e) {
            return "Backup failed: " + e.getMessage();
        } finally {
            tmp.delete();
        }
    }
}
