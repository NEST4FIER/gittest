package org.fiercoin.wallet;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;

/** Settings and RPC access for the bundled FierCoin node. */
final class Node {
    static final int RPC_PORT = 29332;
    static final String DEFAULT_WALLET = "phone";

    /** The wallet the app is showing (the original "phone" one, or a restored backup). */
    static String wallet(Context c) {
        return prefs(c).getString("wallet", DEFAULT_WALLET);
    }

    static void setWallet(Context c, String name) {
        prefs(c).edit().putString("wallet", name).apply();
    }

    private Node() {}

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("fiercoin", Context.MODE_PRIVATE);
    }

    static String rpcPassword(Context c) {
        SharedPreferences p = prefs(c);
        String pass = p.getString("rpcpass", null);
        if (pass == null) {
            byte[] b = new byte[24];
            new SecureRandom().nextBytes(b);
            StringBuilder sb = new StringBuilder();
            for (byte x : b) sb.append(String.format("%02x", x));
            pass = sb.toString();
            p.edit().putString("rpcpass", pass).apply();
        }
        return pass;
    }

    static List<String> nodes(Context c) {
        List<String> out = new ArrayList<>();
        for (String s : prefs(c).getString("nodes", "").split(",")) {
            s = s.trim();
            if (!s.isEmpty()) out.add(s);
        }
        return out;
    }

    static void addNode(Context c, String node) {
        node = node.trim().replaceAll("[^0-9A-Za-z.:\\-\\[\\]]", "");
        if (node.isEmpty()) return;
        if (!node.contains(":") || node.startsWith("[") && !node.contains("]:")) node = node + ":29333";
        List<String> n = nodes(c);
        if (!n.contains(node)) n.add(node);
        prefs(c).edit().putString("nodes", String.join(",", n)).apply();
    }

    static void removeNode(Context c, String node) {
        List<String> n = nodes(c);
        n.remove(node.trim());
        prefs(c).edit().putString("nodes", String.join(",", n)).apply();
    }

    static File dataDir(Context c) {
        File d = new File(c.getFilesDir(), "fiercoin");
        d.mkdirs();
        return d;
    }

    /** Calls the node. Returns the raw JSON reply ({"result":..,"error":..}) or an error JSON. */
    static String rpc(Context c, String path, String method, String paramsJson) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL("http://127.0.0.1:" + RPC_PORT + path);
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(3000);
            conn.setReadTimeout(120000);
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            String auth = Base64.encodeToString(("fier:" + rpcPassword(c)).getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP);
            conn.setRequestProperty("Authorization", "Basic " + auth);
            conn.setRequestProperty("Content-Type", "application/json");
            String body = "{\"jsonrpc\":\"1.0\",\"id\":\"app\",\"method\":\"" + method + "\",\"params\":" +
                    (paramsJson == null || paramsJson.isEmpty() ? "[]" : paramsJson) + "}";
            try (OutputStream os = conn.getOutputStream()) {
                os.write(body.getBytes(StandardCharsets.UTF_8));
            }
            int code = conn.getResponseCode();
            InputStream is = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
            if (is == null) return err("Node replied with HTTP " + code);
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int r;
            while ((r = is.read(buf)) > 0) bo.write(buf, 0, r);
            String s = bo.toString("UTF-8");
            return s.isEmpty() ? err("Node replied with HTTP " + code) : s;
        } catch (Exception e) {
            return err("Node is not reachable (" + e.getClass().getSimpleName() + ")");
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    static String err(String msg) {
        return "{\"result\":null,\"error\":{\"code\":-1,\"message\":\"" + msg.replace("\\", "\\\\").replace("\"", "'") + "\"}}";
    }
}
