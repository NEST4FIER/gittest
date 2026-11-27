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
        return Node.rpc(a, "/wallet/" + Node.wallet(a), method, params);
    }

    @JavascriptInterface
    public String activeWallet() {
        return Node.wallet(a);
    }

    @JavascriptInterface
    public void setActiveWallet(String name) {
        if (name.matches("[A-Za-z0-9._-]{1,64}")) Node.setWallet(a, name);
    }

    /**
     * Copies a wallet backup file (sent from the page as base64) into its own wallet folder
     * so the node can load it. Returns the new wallet's name, or "ERROR: ..." on failure.
     */
    @JavascriptInterface
    public String restoreWallet(String base64) {
        try {
            byte[] data = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
            if (data.length < 4096) return "ERROR: That file is too small to be a FierCoin wallet backup.";
            // Berkeley DB btree files carry the magic number 0x00053162 at offset 12.
            boolean le = (data[12] & 0xff) == 0x62 && (data[13] & 0xff) == 0x31 && (data[14] & 0xff) == 0x05 && data[15] == 0;
            boolean be = data[12] == 0 && (data[13] & 0xff) == 0x05 && (data[14] & 0xff) == 0x31 && (data[15] & 0xff) == 0x62;
            if (!le && !be) return "ERROR: That file is not a FierCoin wallet backup.";
            String name = "restored-" + new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(new Date());
            File dir = new File(new File(Node.dataDir(a), "wallets"), name);
            if (!dir.mkdirs()) return "ERROR: Could not make a folder for the restored wallet.";
            try (OutputStream out = new java.io.FileOutputStream(new File(dir, "wallet.dat"))) {
                out.write(data);
            }
            return name;
        } catch (Exception e) {
            return "ERROR: " + e.getMessage();
        }
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
    public void openUrl(String url) {
        if (!url.startsWith("http://") && !url.startsWith("https://")) return;
        Intent view = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        view.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { a.startActivity(view); } catch (Exception ignored) { }
    }

    @JavascriptInterface
    public void share(String text) {
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");
        send.putExtra(Intent.EXTRA_TEXT, text);
        Intent chooser = Intent.createChooser(send, "Share your FierCoin address");
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        a.startActivity(chooser);
    }

    /** Opens Android's print screen for the page. Its print layout shows only the pay-me cards. */
    @JavascriptInterface
    public void print(String title) {
        a.runOnUiThread(new PrintTask(a, title));
    }

    /**
     * A PNG from the app's assets as a data: URL. The page needs this to draw the logo on the
     * pay-me card: a picture loaded from file:// would stop the card from being saved or printed.
     */
    @JavascriptInterface
    public String assetDataUrl(String name) {
        if (name == null || !name.matches("[A-Za-z0-9._-]+\\.png")) return "";
        try (InputStream in = a.getAssets().open(name)) {
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int r;
            while ((r = in.read(buf)) > 0) out.write(buf, 0, r);
            return "data:image/png;base64," + android.util.Base64.encodeToString(out.toByteArray(), android.util.Base64.NO_WRAP);
        } catch (Exception e) {
            return "";
        }
    }

    /** Saves a PNG picture (base64) into the phone's Pictures/FierCoin folder. Returns a message for the user. */
    @JavascriptInterface
    public String saveImage(String base64, String name) {
        String file = name == null ? "" : name.replaceAll("[^A-Za-z0-9._-]", "");
        if (!file.endsWith(".png") || file.length() < 5) file = "fiercoin-pay-me-card.png";
        byte[] png;
        try {
            png = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            return "Could not save the picture.";
        }
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.Images.Media.DISPLAY_NAME, file);
                v.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
                v.put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/FierCoin");
                Uri uri = a.getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
                if (uri == null) return "Could not save the picture.";
                try (OutputStream out = a.getContentResolver().openOutputStream(uri)) {
                    out.write(png);
                }
                return "Saved to your photos, in the FierCoin album.";
            }
            File dest = new File(a.getExternalFilesDir(android.os.Environment.DIRECTORY_PICTURES), file);
            try (OutputStream out = new java.io.FileOutputStream(dest)) {
                out.write(png);
            }
            return "Saved to " + dest.getAbsolutePath();
        } catch (Exception e) {
            return "Could not save the picture: " + e.getMessage();
        }
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
